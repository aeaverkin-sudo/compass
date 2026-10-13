import { readFile } from "node:fs/promises";
import path from "node:path";
import forge from "node-forge";
import { PKPass } from "passkit-generator";
import type { WalletBackField } from "@/shared/services/wallet-pass-content";

/** All five Apple values are in the environment. Until then the buttons say «coming soon». */
export function walletConfigured() {
  return Boolean(
    process.env.APPLE_TEAM_ID &&
      process.env.APPLE_PASS_TYPE_ID &&
      process.env.APPLE_WWDR_CERT_BASE64 &&
      process.env.APPLE_PASS_CERT_BASE64 &&
      process.env.APPLE_PASS_CERT_PASSWORD,
  );
}

export type PassField = { key: string; label: string; value: string };

export type PassInput = {
  /** `eventTicket` for the event badge, `generic` for the personal pass. */
  style: "eventTicket" | "generic";
  /** One pass per serial: the same serial replaces the pass already in Wallet. */
  serialNumber: string;
  organizationName: string;
  description: string;
  /** The event logo as PNG at 1×, 2× and 3×, whole inside Apple's 160×50 box. Without it, the ADED icon. */
  logo?: { x1: Buffer; x2: Buffer; x3: Buffer } | null;
  logoText?: string;
  header?: PassField | null;
  primary: PassField;
  secondary?: PassField[];
  auxiliary?: PassField[];
  backFields?: WalletBackField[];
  /** The QR. */
  barcodeMessage: string;
  expiresAt?: string | null;
};

type Signer = { wwdr: string; signerCert: string; signerKey: string };

let signer: Signer | null = null;

function pemFromBase64(value: string): string {
  const raw = Buffer.from(value.trim(), "base64");
  const text = raw.toString("utf8");
  if (text.includes("-----BEGIN")) return text;
  const der = forge.util.createBuffer(raw.toString("binary"));
  return forge.pki.certificateToPem(forge.pki.certificateFromAsn1(forge.asn1.fromDer(der)));
}

/** The .p12 holds the pass certificate and its key; its password opens it here, never by hand. */
function unpackP12(base64: string, password: string): { cert: string; key: string } {
  const der = forge.util.createBuffer(Buffer.from(base64.trim(), "base64").toString("binary"));
  const p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(der), password);
  const certBag = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag]?.find((bag) => bag.cert);
  const keyBag =
    p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag]?.find((bag) => bag.key) ??
    p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag]?.find((bag) => bag.key);
  if (!certBag?.cert || !keyBag?.key) throw new Error("wallet_certificate_unreadable");
  return { cert: forge.pki.certificateToPem(certBag.cert), key: forge.pki.privateKeyToPem(keyBag.key) };
}

function loadSigner(): Signer {
  if (signer) return signer;
  const { cert, key } = unpackP12(process.env.APPLE_PASS_CERT_BASE64!, process.env.APPLE_PASS_CERT_PASSWORD!);
  signer = { wwdr: pemFromBase64(process.env.APPLE_WWDR_CERT_BASE64!), signerCert: cert, signerKey: key };
  return signer;
}

let icon: Buffer | null = null;

async function adedIcon(): Promise<Buffer> {
  icon ??= await readFile(path.join(process.cwd(), "public", "icons", "icon-192.png"));
  return icon;
}

/** A signed .pkpass. Throws `wallet_not_configured` until the Apple values are in the env. */
export async function buildPass(input: PassInput): Promise<Buffer> {
  if (!walletConfigured()) throw new Error("wallet_not_configured");
  const certificates = loadSigner();
  const pass = new PKPass({}, certificates, {
    passTypeIdentifier: process.env.APPLE_PASS_TYPE_ID!,
    teamIdentifier: process.env.APPLE_TEAM_ID!,
    serialNumber: input.serialNumber,
    organizationName: input.organizationName,
    description: input.description,
    ...(input.logoText ? { logoText: input.logoText } : {}),
    backgroundColor: "rgb(255, 255, 255)",
    foregroundColor: "rgb(17, 17, 17)",
    labelColor: "rgb(153, 153, 153)",
  });
  pass.type = input.style;
  const fallback = await adedIcon();
  pass.addBuffer("icon.png", fallback);
  pass.addBuffer("icon@2x.png", fallback);
  pass.addBuffer("logo.png", input.logo?.x1 ?? fallback);
  if (input.logo) {
    pass.addBuffer("logo@2x.png", input.logo.x2);
    pass.addBuffer("logo@3x.png", input.logo.x3);
  }
  if (input.header) pass.headerFields.push(input.header);
  pass.primaryFields.push(input.primary);
  for (const field of input.secondary ?? []) pass.secondaryFields.push(field);
  for (const field of input.auxiliary ?? []) pass.auxiliaryFields.push(field);
  for (const field of input.backFields ?? []) pass.backFields.push(field);
  pass.setBarcodes({ message: input.barcodeMessage, format: "PKBarcodeFormatQR", messageEncoding: "iso-8859-1" });
  if (input.expiresAt) pass.setExpirationDate(new Date(input.expiresAt));
  return pass.getAsBuffer();
}

export function pkpassResponseHeaders(fileName: string): Record<string, string> {
  const safe = fileName.replace(/[^\p{L}\p{N} ._-]+/gu, "").trim().slice(0, 60) || "pass";
  return {
    "Content-Type": "application/vnd.apple.pkpass",
    "Content-Disposition": `attachment; filename="pass.pkpass"; filename*=UTF-8''${encodeURIComponent(`${safe}.pkpass`)}`,
    "Cache-Control": "no-store",
  };
}

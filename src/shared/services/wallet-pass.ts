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

export type PassField = {
  key: string;
  label: string;
  value: string;
  textAlignment?: "PKTextAlignmentLeft" | "PKTextAlignmentRight";
};

/** One Wallet image at 1×, 2× and 3×. */
export type PassImage = { x1: Buffer; x2: Buffer; x3: Buffer };

/** One pass per person, a store card: our strip with the card on it, then Wallet's QR. Entry to an event goes by the card's owner. */
export type PassInput = {
  /** One pass per serial: the same serial replaces the pass already in Wallet. */
  serialNumber: string;
  organizationName: string;
  description: string;
  /** Wallet's header logo: the top of the orange tab with the number. */
  logo: PassImage;
  /** Next to the logo: the card's address. */
  logoText: string;
  /** Under the header: the bottom of the tab, photo, name and the aded mark, drawn by us. */
  strip: PassImage;
  /** The row under the strip. */
  secondaryFields?: PassField[];
  backFields?: WalletBackField[];
  /** The QR. */
  barcodeMessage: string;
  /** Wallet prints it under the QR. */
  barcodeAltText?: string;
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

let brand: Promise<{ icon: PassImage }> | null = null;

/** The grid ADED mark on a white square, for notifications. The mark on the pass is in the strip. */
function adedBrand() {
  brand ??= (async () => {
    const dir = path.join(process.cwd(), "public", "brand", "wallet");
    const read = async (name: string): Promise<PassImage> => {
      const [x1, x2, x3] = await Promise.all([1, 2, 3].map((scale) => readFile(path.join(dir, `${name}@${scale}x.png`))));
      return { x1: x1!, x2: x2!, x3: x3! };
    };
    return { icon: await read("aded-grid-icon") };
  })().catch((error: unknown) => {
    brand = null;
    throw error;
  });
  return brand;
}

function addImage(pass: PKPass, name: string, image: PassImage) {
  pass.addBuffer(`${name}.png`, image.x1);
  pass.addBuffer(`${name}@2x.png`, image.x2);
  pass.addBuffer(`${name}@3x.png`, image.x3);
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
    backgroundColor: "rgb(255, 255, 255)",
    foregroundColor: "rgb(17, 17, 17)",
    labelColor: "rgb(232, 100, 12)",
    logoText: input.logoText,
  });
  pass.type = "storeCard";
  const { icon } = await adedBrand();
  addImage(pass, "icon", icon);
  addImage(pass, "logo", input.logo);
  addImage(pass, "strip", input.strip);
  for (const field of input.secondaryFields ?? []) {
    pass.secondaryFields.push({ ...field, textAlignment: field.textAlignment ?? "PKTextAlignmentLeft" });
  }
  for (const field of input.backFields ?? []) pass.backFields.push(field);
  pass.setBarcodes({
    message: input.barcodeMessage,
    format: "PKBarcodeFormatQR",
    messageEncoding: "iso-8859-1",
    ...(input.barcodeAltText ? { altText: input.barcodeAltText } : {}),
  });
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

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import type { PassImage } from "@/shared/services/wallet-pass";

/** Apple's strip box on a store card, in points. */
const W = 375;
const H = 144;
const S = 3;

const INK = "#111111";
const GREY = "#999999";
const RULE = "#999999";

const LOGO_H = 22;
const LOGO_W = Math.round((LOGO_H * 477) / 150);
const RULE_INSET = 20;
const RULE_TOP = 40;
const RULE_BOTTOM = 139;
const PHOTO = 72;
const PHOTO_LEFT = 26;
const NAME_LEFT = PHOTO_LEFT + PHOTO + 16;
const NAME_WIDTH = W - NAME_LEFT - RULE_INSET;

let assets: Promise<{ regular: ArrayBuffer; bold: ArrayBuffer; logo: string }> | null = null;

function asArrayBuffer(bytes: Buffer): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function loadAssets() {
  assets ??= Promise.all([
    readFile(join(process.cwd(), "public/fonts/Arimo-Regular.ttf")),
    readFile(join(process.cwd(), "public/fonts/Arimo-Bold.ttf")),
    readFile(join(process.cwd(), "public/brand/wallet/aded-grid-orange@3x.png")),
  ])
    .then(([regular, bold, logo]) => ({
      regular: asArrayBuffer(regular),
      bold: asArrayBuffer(bold),
      logo: `data:image/png;base64,${logo.toString("base64")}`,
    }))
    .catch((error: unknown) => {
      assets = null;
      throw error;
    });
  return assets;
}

/** Two lines at most, as on the card; the longest line sets the size. */
function nameLines(name: string): string[] {
  const kept = name
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  if (kept.length >= 2) return [kept[0]!, kept.slice(1).join(" ")];
  const words = (kept[0] ?? "").split(" ");
  if (words.length < 2) return [kept[0] ?? ""];
  const half = Math.ceil(words.length / 2);
  return [words.slice(0, half).join(" "), words.slice(half).join(" ")];
}

function nameSize(lines: string[], hasPosition: boolean): number {
  const longest = Math.max(...lines.map((line) => line.length), 1);
  const byWidth = NAME_WIDTH / (longest * 0.56);
  const byHeight = (PHOTO - (hasPosition ? 18 : 0)) / (lines.length * 1.02);
  return Math.max(14, Math.min(28, byWidth, byHeight));
}

/**
 * The top of the personal pass: the grid aded, a rule, the photo with its shadow,
 * the name and the Position, a rule. White; Wallet draws the QR under it.
 */
export async function walletStrip(card: { name: string; position: string | null; photoPng: Buffer | null }): Promise<PassImage> {
  const { regular, bold, logo } = await loadAssets();
  const lines = nameLines(card.name);
  const size = nameSize(lines, Boolean(card.position));
  const blockTop = (RULE_TOP + RULE_BOTTOM) / 2 - PHOTO / 2;
  const photo = card.photoPng ? `data:image/png;base64,${card.photoPng.toString("base64")}` : null;
  const rule = (top: number) => (
    <div style={{ position: "absolute", left: RULE_INSET * S, top: top * S, width: (W - RULE_INSET * 2) * S, height: S, background: RULE }} />
  );

  const element = (
    <div style={{ position: "relative", display: "flex", width: W * S, height: H * S, background: "#ffffff", fontFamily: "Arimo" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={logo}
        width={LOGO_W * S}
        height={LOGO_H * S}
        alt=""
        style={{ position: "absolute", left: ((W - LOGO_W) / 2) * S, top: 9 * S }}
      />
      {rule(RULE_TOP)}
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photo}
          width={PHOTO * S}
          height={PHOTO * S}
          alt=""
          style={{
            position: "absolute",
            left: PHOTO_LEFT * S,
            top: blockTop * S,
            boxShadow: `0 ${2 * S}px ${7 * S}px rgba(0, 0, 0, 0.28)`,
          }}
        />
      ) : null}
      <div
        style={{
          position: "absolute",
          left: (photo ? NAME_LEFT : RULE_INSET + 6) * S,
          top: blockTop * S,
          width: (photo ? NAME_WIDTH : W - RULE_INSET * 2 - 12) * S,
          height: PHOTO * S,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
        }}
      >
        {lines.map((line, index) => (
          <div
            key={index}
            style={{
              display: "flex",
              fontSize: size * S,
              fontWeight: 700,
              lineHeight: 1.02,
              letterSpacing: -0.6 * S,
              color: INK,
              whiteSpace: "nowrap",
            }}
          >
            {line}
          </div>
        ))}
        {card.position ? (
          <div
            style={{
              display: "flex",
              marginTop: 6 * S,
              fontSize: 9.5 * S,
              fontWeight: 400,
              letterSpacing: 1.1 * S,
              textTransform: "uppercase",
              color: GREY,
              whiteSpace: "nowrap",
              overflow: "hidden",
            }}
          >
            {card.position}
          </div>
        ) : null}
      </div>
      {rule(RULE_BOTTOM)}
    </div>
  );

  const response = new ImageResponse(element, {
    width: W * S,
    height: H * S,
    fonts: [
      { name: "Arimo", data: regular, weight: 400, style: "normal" },
      { name: "Arimo", data: bold, weight: 700, style: "normal" },
    ],
  });
  const x3 = Buffer.from(await response.arrayBuffer());
  const { default: sharp } = await import("sharp");
  const [x2, x1] = await Promise.all([
    sharp(x3).resize(W * 2, H * 2).png().toBuffer(),
    sharp(x3).resize(W, H).png().toBuffer(),
  ]);
  return { x1, x2, x3 };
}

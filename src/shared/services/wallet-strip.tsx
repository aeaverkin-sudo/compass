import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import type { PassImage } from "@/shared/services/wallet-pass";

/** Apple's strip box on a store card, in points. */
const W = 375;
const H = 144;
const S = 3;

const INK = "#111111";
const ORANGE = "#E8640C";
const SKY = "#c5e8f7";
const GRID_LINE = "rgba(232, 100, 12, 0.16)";
const GRID_STEP = 17;

const PHOTO = 116;
const PHOTO_LEFT = 16;
const PHOTO_TOP = (H - PHOTO) / 2;
const GAP = 14;
const NAME_LEFT = PHOTO_LEFT + PHOTO + GAP;

/** The grid aded, upright before it is turned to read bottom to top. */
const MARK_H = 22;
const MARK_W = Math.round((MARK_H * 477) / 150);
const MARK_RIGHT = 6;
const NAME_RIGHT = W - MARK_RIGHT - MARK_H - 8;
/** Arimo Bold, about 0.56 em a character; a long name shrinks to fit. */
const NAME_EM = 0.56;
const NAME_MAX = 33;
const NAME_LEADING = 0.95;

let assets: Promise<{ regular: ArrayBuffer; bold: ArrayBuffer; mark: string }> | null = null;

function asArrayBuffer(bytes: Buffer): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function loadAssets() {
  assets ??= (async () => {
    const [regular, bold, logo] = await Promise.all([
      readFile(join(process.cwd(), "public/fonts/Arimo-Regular.ttf")),
      readFile(join(process.cwd(), "public/fonts/Arimo-Bold.ttf")),
      readFile(join(process.cwd(), "public/brand/wallet/aded-grid-orange@3x.png")),
    ]);
    const { default: sharp } = await import("sharp");
    const turned = await sharp(logo).rotate(270).resize(MARK_H * S, MARK_W * S).png().toBuffer();
    return {
      regular: asArrayBuffer(regular),
      bold: asArrayBuffer(bold),
      mark: `data:image/png;base64,${turned.toString("base64")}`,
    };
  })().catch((error: unknown) => {
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

function nameSize(lines: string[], width: number): number {
  const longest = Math.max(...lines.map((line) => line.length), 1);
  const byWidth = width / (longest * NAME_EM);
  const byHeight = PHOTO / (lines.length * NAME_LEADING);
  return Math.min(NAME_MAX, byWidth, byHeight);
}

function grid() {
  const lines = [];
  for (let x = 0; x < W; x += GRID_STEP) {
    lines.push(<div key={`x${x}`} style={{ position: "absolute", left: x * S, top: 0, width: S, height: H * S, background: GRID_LINE }} />);
  }
  for (let y = 0; y < H; y += GRID_STEP) {
    lines.push(<div key={`y${y}`} style={{ position: "absolute", left: 0, top: y * S, width: W * S, height: S, background: GRID_LINE }} />);
  }
  return lines;
}

/**
 * The strip of the personal pass: sky with a faint orange grid, the photo, the name in two lines,
 * and the grid aded turned upright at the right edge. The number and the site sit in Wallet's header.
 */
export async function walletStrip(card: { name: string; photoPng: Buffer | null }): Promise<PassImage> {
  const { regular, bold, mark } = await loadAssets();
  const photo = card.photoPng ? `data:image/png;base64,${card.photoPng.toString("base64")}` : null;
  const left = photo ? NAME_LEFT : PHOTO_LEFT;
  const width = NAME_RIGHT - left;
  const lines = nameLines(card.name);
  const size = nameSize(lines, width);

  const element = (
    <div style={{ position: "relative", display: "flex", width: W * S, height: H * S, background: SKY, fontFamily: "Arimo" }}>
      {grid()}
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
            top: PHOTO_TOP * S,
            boxShadow: `0 ${2 * S}px ${8 * S}px rgba(0, 0, 0, 0.22)`,
          }}
        />
      ) : null}
      <div
        style={{
          position: "absolute",
          left: left * S,
          top: PHOTO_TOP * S,
          width: width * S,
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
              lineHeight: NAME_LEADING,
              letterSpacing: -0.03 * size * S,
              color: INK,
              whiteSpace: "nowrap",
            }}
          >
            {line}
          </div>
        ))}
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={mark}
        width={MARK_H * S}
        height={MARK_W * S}
        alt=""
        style={{
          position: "absolute",
          left: (W - MARK_RIGHT - MARK_H) * S,
          top: (PHOTO_TOP + PHOTO / 2 - MARK_W / 2) * S,
        }}
      />
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
  return scaled(Buffer.from(await response.arrayBuffer()), W, H);
}

async function scaled(x3: Buffer, width: number, height: number): Promise<PassImage> {
  const { default: sharp } = await import("sharp");
  const [x2, x1] = await Promise.all([
    sharp(x3).resize(width * 2, height * 2).png().toBuffer(),
    sharp(x3).resize(width, height).png().toBuffer(),
  ]);
  return { x1, x2, x3 };
}

/** The header logo: an orange square, the number in white. */
const LOGO_SIZE = 44;
const LOGO_NUMBER_SIZE = 20;

/** Wallet's header logo: the orange square with the pass number. */
export async function walletNumber(number: string): Promise<PassImage> {
  const { bold } = await loadAssets();
  const element = (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: LOGO_SIZE * S,
        height: LOGO_SIZE * S,
        background: ORANGE,
        color: "#ffffff",
        fontFamily: "Arimo",
        fontSize: LOGO_NUMBER_SIZE * S,
        fontWeight: 700,
        lineHeight: 1,
      }}
    >
      {number}
    </div>
  );
  const response = new ImageResponse(element, {
    width: LOGO_SIZE * S,
    height: LOGO_SIZE * S,
    fonts: [{ name: "Arimo", data: bold, weight: 700, style: "normal" }],
  });
  return scaled(Buffer.from(await response.arrayBuffer()), LOGO_SIZE, LOGO_SIZE);
}

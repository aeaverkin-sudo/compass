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

/**
 * The tab: one orange piece, 3 cells wide. The top part is the Wallet logo with the number,
 * the bottom part is the 3×3 square in the strip's top left corner.
 * Wallet sets the logo's left margin itself: TAB_LEFT is tuned on the phone so both meet.
 */
const TAB_LEFT = 16;
const TAB_W = GRID_STEP * 3;

const PHOTO = 116;
const PHOTO_LEFT = 79;
const PHOTO_TOP = (H - PHOTO) / 2;
const GAP = 14;
const NAME_LEFT = PHOTO_LEFT + PHOTO + GAP;

/** The grid aded, upright before it is turned to read bottom to top. */
const MARK_H = 22;
const MARK_W = Math.round((MARK_H * 477) / 150);
const MARK_RIGHT = 6;
const NAME_RIGHT = W - MARK_RIGHT - MARK_H - 8;

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
  const longest = Math.max(...lines.map((line, index) => line.length + (index === lines.length - 1 ? 1 : 0)), 1);
  const byWidth = width / (longest * 0.56);
  const byHeight = PHOTO / (lines.length * 0.96);
  return Math.max(14, Math.min(26, byWidth, byHeight));
}

/** Columns start at the tab's left edge, so the orange square covers whole cells. */
function grid() {
  const lines = [];
  for (let x = TAB_LEFT % GRID_STEP; x < W; x += GRID_STEP) {
    lines.push(<div key={`x${x}`} style={{ position: "absolute", left: x * S, top: 0, width: S, height: H * S, background: GRID_LINE }} />);
  }
  for (let y = 0; y < H; y += GRID_STEP) {
    lines.push(<div key={`y${y}`} style={{ position: "absolute", left: 0, top: y * S, width: W * S, height: S, background: GRID_LINE }} />);
  }
  return lines;
}

/**
 * The strip of the personal pass: sky with a faint orange grid, the lower part of the orange tab,
 * the photo, the name with its orange dot, and the grid aded turned upright at the right edge.
 * The address and the number sit in Wallet's own header above it.
 */
export async function walletStrip(card: { name: string; photoPng: Buffer | null }): Promise<PassImage> {
  const { regular, bold, mark } = await loadAssets();
  const photo = card.photoPng ? `data:image/png;base64,${card.photoPng.toString("base64")}` : null;
  const left = photo ? NAME_LEFT : PHOTO_LEFT;
  const width = NAME_RIGHT - left;
  const lines = nameLines(card.name);
  const size = nameSize(lines, width);
  const last = lines.length - 1;

  const element = (
    <div style={{ position: "relative", display: "flex", width: W * S, height: H * S, background: SKY, fontFamily: "Arimo" }}>
      {grid()}
      <div
        style={{ position: "absolute", left: TAB_LEFT * S, top: 0, width: TAB_W * S, height: TAB_W * S, background: ORANGE }}
      />
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
              lineHeight: 0.96,
              letterSpacing: -0.03 * size * S,
              color: INK,
              whiteSpace: "nowrap",
            }}
          >
            {line}
            {index === last ? <span style={{ color: ORANGE }}>.</span> : null}
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

/** Apple's logo box: 160 × 50 points at most. */
const LOGO_MAX_W = 160;
const LOGO_H = 50;
const TAB_TOP_H = 46;
const TAB_NUMBER_SIZE = 24;
/** Wallet's header: the pass width and the logo text, as measured on the phone. */
const PASS_W = 343;
const LOGO_TEXT_SIZE = 17;
const LOGO_TEXT_GAP = 8;

/**
 * The top part of the tab, as the Wallet logo: the orange block with the number at the bottom left,
 * then clear space, so Wallet's logo text starts near the middle of the header.
 */
export async function walletTab(number: string, logoText: string): Promise<PassImage> {
  const { bold } = await loadAssets();
  const textW = logoText.length * LOGO_TEXT_SIZE * 0.56;
  const centred = Math.round(PASS_W / 2 - textW / 2 - TAB_LEFT - LOGO_TEXT_GAP);
  const width = Math.max(TAB_W + 8, Math.min(LOGO_MAX_W, centred));
  const element = (
    <div style={{ position: "relative", display: "flex", width: width * S, height: LOGO_H * S, fontFamily: "Arimo" }}>
      <div
        style={{
          position: "absolute",
          left: 0,
          bottom: 0,
          width: TAB_W * S,
          height: TAB_TOP_H * S,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: ORANGE,
          color: "#ffffff",
          fontSize: TAB_NUMBER_SIZE * S,
          fontWeight: 700,
          lineHeight: 1,
        }}
      >
        {number}
      </div>
    </div>
  );
  const response = new ImageResponse(element, {
    width: width * S,
    height: LOGO_H * S,
    fonts: [{ name: "Arimo", data: bold, weight: 700, style: "normal" }],
  });
  return scaled(Buffer.from(await response.arrayBuffer()), width, LOGO_H);
}

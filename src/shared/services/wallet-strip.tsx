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
const ADDRESS_INK = "#2b4a54";
const GRID_LINE = "rgba(232, 100, 12, 0.16)";
const GRID_STEP = 17;

const ADDRESS_LEFT = 15;
const ADDRESS_TOP = 3;
const ADDRESS_SIZE = 10.5;
/** Three grid cells, flush to the top right corner. */
const NUMBER_BOX = GRID_STEP * 3;
const NUMBER_SIZE = 19.5;

const PHOTO = 90;
const PHOTO_LEFT = 14;
const PHOTO_TOP = 50;
const GAP = 14;
const NAME_LEFT = PHOTO_LEFT + PHOTO + GAP;

/** The grid aded, upright before it is turned to read bottom to top. */
const MARK_H = 22;
const MARK_W = Math.round((MARK_H * 477) / 150);
const MARK_RIGHT = 6;
const NAME_RIGHT = W - MARK_RIGHT - MARK_H - 8;

let assets: Promise<{ regular: ArrayBuffer; bold: ArrayBuffer; mono: ArrayBuffer; mark: string }> | null = null;

function asArrayBuffer(bytes: Buffer): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function loadAssets() {
  assets ??= (async () => {
    const [regular, bold, mono, logo] = await Promise.all([
      readFile(join(process.cwd(), "public/fonts/Arimo-Regular.ttf")),
      readFile(join(process.cwd(), "public/fonts/Arimo-Bold.ttf")),
      readFile(join(process.cwd(), "public/fonts/Cousine-Regular.ttf")),
      readFile(join(process.cwd(), "public/brand/wallet/aded-grid-orange@3x.png")),
    ]);
    const { default: sharp } = await import("sharp");
    const turned = await sharp(logo).rotate(270).resize(MARK_H * S, MARK_W * S).png().toBuffer();
    return {
      regular: asArrayBuffer(regular),
      bold: asArrayBuffer(bold),
      mono: asArrayBuffer(mono),
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

/** Cousine runs 0.6 em a character; a longer address gives way to the site's own. */
export function addressFits(address: string): boolean {
  return address.length * ADDRESS_SIZE * 0.6 <= W - ADDRESS_LEFT - NUMBER_BOX - 8;
}

/** Columns run from the right edge, so the number square sits exactly on three cells. */
function grid() {
  const lines = [];
  for (let x = W - GRID_STEP; x >= 0; x -= GRID_STEP) {
    lines.push(<div key={`x${x}`} style={{ position: "absolute", left: x * S, top: 0, width: S, height: H * S, background: GRID_LINE }} />);
  }
  for (let y = 0; y < H; y += GRID_STEP) {
    lines.push(<div key={`y${y}`} style={{ position: "absolute", left: 0, top: y * S, width: W * S, height: S, background: GRID_LINE }} />);
  }
  return lines;
}

/**
 * The whole top of the personal pass: sky with a faint orange grid, the address in the top cell,
 * the pass number in an orange square, the photo, the name with its orange dot, and the grid aded
 * turned upright at the right edge. Wallet draws the fields and the QR under it.
 */
export async function walletStrip(card: {
  name: string;
  photoPng: Buffer | null;
  address: string;
  number: string;
}): Promise<PassImage> {
  const { regular, bold, mono, mark } = await loadAssets();
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
        style={{
          position: "absolute",
          left: ADDRESS_LEFT * S,
          top: ADDRESS_TOP * S,
          height: GRID_STEP * S,
          display: "flex",
          alignItems: "center",
          fontFamily: "Cousine",
          fontSize: ADDRESS_SIZE * S,
          letterSpacing: 0.01 * ADDRESS_SIZE * S,
          color: ADDRESS_INK,
          whiteSpace: "nowrap",
        }}
      >
        {card.address}
      </div>
      <div
        style={{
          position: "absolute",
          right: 0,
          top: 0,
          width: NUMBER_BOX * S,
          height: NUMBER_BOX * S,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: ORANGE,
          color: "#ffffff",
          fontSize: NUMBER_SIZE * S,
          fontWeight: 700,
          letterSpacing: 0.01 * NUMBER_SIZE * S,
          lineHeight: 1,
        }}
      >
        {card.number}
      </div>
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
      { name: "Cousine", data: mono, weight: 400, style: "normal" },
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

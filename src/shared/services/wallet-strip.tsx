import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import { eventThemeById, type EventThemeId } from "@/shared/event/themes";
import type { PassImage } from "@/shared/services/wallet-pass";

/** Apple's event-ticket strip, in points. */
const STRIP_W = 375;
const STRIP_H = 98;
const PAD = 16;
const LOGO_MAX_H = 60;
const LOGO_MAX_W = 160;
const NAME_SIZE = 20;

let bold: Promise<ArrayBuffer> | null = null;

function arimoBold() {
  bold ??= readFile(path.join(process.cwd(), "public", "fonts", "Arimo-Bold.ttf"))
    .then((bytes) => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer)
    .catch((error: unknown) => {
      bold = null;
      throw error;
    });
  return bold;
}

type Logo = { png: Buffer; width: number; height: number };

/** The event logo whole inside its box at this scale, never cropped. */
async function fitLogo(bytes: Uint8Array, scale: number): Promise<Logo | null> {
  try {
    const { default: sharp } = await import("sharp");
    const { data, info } = await sharp(Buffer.from(bytes), { failOn: "none", density: 300 })
      .rotate()
      .resize(LOGO_MAX_W * scale, LOGO_MAX_H * scale, { fit: "inside", withoutEnlargement: false })
      .png()
      .toBuffer({ resolveWithObject: true });
    return { png: data, width: info.width, height: info.height };
  } catch {
    return null;
  }
}

async function paint(name: string, themeId: EventThemeId, logo: Logo | null, scale: number, font: ArrayBuffer): Promise<Buffer> {
  const theme = eventThemeById(themeId);
  const element = (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: PAD * scale,
        padding: `0 ${PAD * scale}px`,
        background: theme.ground,
        color: theme.ink,
        fontFamily: "Arimo",
      }}
    >
      {logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`data:image/png;base64,${logo.png.toString("base64")}`}
          width={logo.width}
          height={logo.height}
          alt=""
          style={{ flexShrink: 0 }}
        />
      ) : (
        <div style={{ display: "flex" }} />
      )}
      <div
        style={{
          display: "block",
          maxWidth: (STRIP_W - PAD * 3 - (logo ? logo.width / scale : 0)) * scale,
          fontSize: NAME_SIZE * scale,
          fontWeight: 700,
          lineHeight: 1.1,
          textAlign: "right",
          lineClamp: 2,
        }}
      >
        {name}
      </div>
    </div>
  );
  const response = new ImageResponse(element, {
    width: STRIP_W * scale,
    height: STRIP_H * scale,
    fonts: [{ name: "Arimo", data: font, weight: 700, style: "normal" }],
  });
  return Buffer.from(await response.arrayBuffer());
}

/** The event band: the theme ground, the whole logo on the left, the event name on the right. */
export async function eventStrip(name: string, themeId: EventThemeId, logoBytes: Uint8Array | null): Promise<PassImage | null> {
  try {
    const font = await arimoBold();
    const [x1, x2, x3] = await Promise.all(
      [1, 2, 3].map(async (scale) => paint(name, themeId, logoBytes ? await fitLogo(logoBytes, scale) : null, scale, font)),
    );
    return { x1: x1!, x2: x2!, x3: x3! };
  } catch (error) {
    console.error("[wallet] strip", error instanceof Error ? error.message : error);
    return null;
  }
}

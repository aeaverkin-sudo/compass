import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { ogPosterElement } from "@/shared/event/og-poster";
import type { TeamRoleName } from "@/shared/event/permissions";
import { previewPriceLabel } from "@/shared/event/payment-label";
import { eventPreviewLine } from "@/shared/event/when";
import { loadPreviewPay } from "@/shared/services/event-payment";
import { downloadAttachmentBytes, loadAttachment } from "@/shared/services/attachment-api";
import { loadEventInvite, type EventInvite } from "@/shared/services/event-invite";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WIDTH = 1200;
const HEIGHT = 630;
const ROLES = new Set<TeamRoleName>(["Co-host", "Door", "Custom"]);

let fontData: Promise<{ regular: ArrayBuffer; bold: ArrayBuffer }> | null = null;

function asArrayBuffer(bytes: Buffer): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function fonts() {
  if (!fontData) {
    fontData = Promise.all([
      readFile(join(process.cwd(), "public/fonts/Arimo-Regular.ttf")),
      readFile(join(process.cwd(), "public/fonts/Arimo-Bold.ttf")),
    ])
      .then(([regular, bold]) => ({ regular: asArrayBuffer(regular), bold: asArrayBuffer(bold) }))
      .catch((error: unknown) => {
        fontData = null;
        throw error;
      });
  }
  return fontData;
}

async function loadedFonts() {
  try {
    return await fonts();
  } catch (error) {
    console.error("[og] fonts", error);
    return null;
  }
}

async function logoDataUrl(event: EventInvite): Promise<string | null> {
  if (!event.logoAttachmentId) return null;
  try {
    const row = await loadAttachment(event.logoAttachmentId);
    if (!row || row.status !== "ready") return null;
    const bytes = await downloadAttachmentBytes(row);
    if (!bytes) return null;
    const { default: sharp } = await import("sharp");
    const png = await sharp(Buffer.from(bytes), { failOn: "none" })
      .rotate()
      .resize(840, 1260, { fit: "cover", position: "centre" })
      .png()
      .toBuffer();
    return `data:image/png;base64,${png.toString("base64")}`;
  } catch {
    return null;
  }
}

const FRESH = "public, max-age=86400, stale-while-revalidate=604800";
const BRIEF = "public, max-age=60";

function paint(element: ReturnType<typeof ogPosterElement>, loaded: { regular: ArrayBuffer; bold: ArrayBuffer } | null, cache: string) {
  return new ImageResponse(element, {
    width: WIDTH,
    height: HEIGHT,
    fonts: loaded
      ? [
          { name: "Arimo", data: loaded.regular, weight: 400, style: "normal" },
          { name: "Arimo", data: loaded.bold, weight: 700, style: "normal" },
        ]
      : undefined,
    headers: { "Cache-Control": cache },
  });
}

async function solidCard() {
  const { default: sharp } = await import("sharp");
  return sharp({
    create: { width: WIDTH, height: HEIGHT, channels: 3, background: "#111111" },
  })
    .png()
    .toBuffer();
}

function spareCard(name: string) {
  return ogPosterElement({
    name: name || "ADED",
    meta: null,
    themeId: "noir",
    layout: "grid",
    photo: null,
    team: false,
    role: null,
  });
}

/** Link image. `?team=1` adds the working ribbon; the file convention would drop that query. */
export async function GET(request: Request, context: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await context.params;
    const query = new URL(request.url).searchParams;
    const team = query.get("team") === "1";
    const roleValue = query.get("role");
    const role = roleValue && ROLES.has(roleValue as TeamRoleName) ? (roleValue as TeamRoleName) : null;
    const event = await loadEventInvite(code);
    const pay = event ? await loadPreviewPay(event.id) : null;
    const loaded = await loadedFonts();
    const photo = event ? await logoDataUrl(event) : null;
    const element = event
      ? ogPosterElement({
          name: event.name || "ADED",
          meta: eventPreviewLine(event.date, event.endsAt, event.place, event.placeSecret, pay ? previewPriceLabel(pay) : null),
          themeId: event.theme,
          layout: event.layout,
          photo,
          team,
          role: team ? role : null,
        })
      : spareCard("ADED");
    return paint(element, loaded, event ? FRESH : BRIEF);
  } catch (error) {
    console.error("[og] event", error);
    try {
      return paint(spareCard("ADED"), null, BRIEF);
    } catch (fallbackError) {
      console.error("[og] spare", fallbackError);
      try {
        const png = await solidCard();
        return new Response(new Uint8Array(png), {
          status: 200,
          headers: { "Content-Type": "image/png", "Cache-Control": BRIEF },
        });
      } catch {
        return new Response(null, { status: 200, headers: { "Cache-Control": "no-store" } });
      }
    }
  }
}

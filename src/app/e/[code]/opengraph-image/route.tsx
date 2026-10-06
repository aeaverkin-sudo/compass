import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { ogPosterElement } from "@/shared/event/og-poster";
import type { TeamRoleName } from "@/shared/event/permissions";
import { eventShareLine } from "@/shared/event/when";
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
    ]).then(([regular, bold]) => ({ regular: asArrayBuffer(regular), bold: asArrayBuffer(bold) }));
  }
  return fontData;
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

/** Link image. `?team=1` adds the working ribbon; the file convention would drop that query. */
export async function GET(request: Request, context: { params: Promise<{ code: string }> }) {
  const { code } = await context.params;
  const query = new URL(request.url).searchParams;
  const team = query.get("team") === "1";
  const roleValue = query.get("role");
  const role = roleValue && ROLES.has(roleValue as TeamRoleName) ? (roleValue as TeamRoleName) : null;
  const event = await loadEventInvite(code);
  const loaded = await fonts();
  const photo = event ? await logoDataUrl(event) : null;
  const element = ogPosterElement(
    event
      ? {
          name: event.name || "ADED",
          meta: eventShareLine(event.date, event.endsAt, event.place, event.placeSecret),
          themeId: event.theme,
          layout: event.layout,
          photo,
          team,
          role: team ? role : null,
        }
      : {
          name: "ADED",
          meta: null,
          themeId: "noir",
          layout: "grid",
          photo: null,
          team: false,
          role: null,
        },
  );

  return new ImageResponse(element, {
    width: WIDTH,
    height: HEIGHT,
    fonts: [
      { name: "Arimo", data: loaded.regular, weight: 400, style: "normal" },
      { name: "Arimo", data: loaded.bold, weight: 700, style: "normal" },
    ],
    headers: { "Cache-Control": "public, max-age=300" },
  });
}

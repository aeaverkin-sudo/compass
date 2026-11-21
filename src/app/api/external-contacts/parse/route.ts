import { NextResponse } from "next/server";
import { contactReadAllowed, gptConfigured, parseContactInput } from "@/features/contact-collect/gpt-parse";
import { requireOwnerId } from "@/shared/services/attachment-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function readingOpen(ownerId: string) {
  return gptConfigured() && contactReadAllowed(ownerId);
}

/** Whether photo and voice reading is on for this account. The key itself is never returned. */
export async function GET() {
  const owner = await requireOwnerId();
  if (!owner.ok) return noStore({ error: owner.error }, owner.status);
  return noStore({ available: readingOpen(owner.id) });
}

async function bytesOf(value: FormDataEntryValue | null) {
  if (!(value instanceof Blob) || value.size === 0) return null;
  const name = value instanceof File && value.name ? value.name : "recording";
  return { mime: value.type || "", name, bytes: new Uint8Array(await value.arrayBuffer()) };
}

export async function POST(request: Request) {
  const owner = await requireOwnerId();
  if (!owner.ok) return noStore({ error: owner.error }, owner.status);
  const openai = readingOpen(owner.id);

  const type = request.headers.get("content-type") ?? "";
  try {
    if (type.includes("multipart/form-data")) {
      if (!openai) return noStore({ error: "Reading is not ready.", available: false }, 503);
      const form = await request.formData();
      const image = await bytesOf(form.get("image"));
      const audio = await bytesOf(form.get("audio"));
      const result = await parseContactInput({
        openai: true,
        image: image ? { mime: image.mime, bytes: image.bytes } : undefined,
        audio: audio ? { mime: audio.mime, name: audio.name, bytes: audio.bytes } : undefined,
      });
      if (!result.ok) {
        return noStore(
          result.available === false ? { error: result.error, available: false } : { error: result.error },
          result.status,
        );
      }
      return noStore({ draft: result.draft });
    }

    const body = (await request.json().catch(() => null)) as { text?: unknown } | null;
    const text = typeof body?.text === "string" ? body.text : "";
    const result = await parseContactInput({ text, openai });
    if (!result.ok) {
      return noStore(
        result.available === false ? { error: result.error, available: false } : { error: result.error },
        result.status,
      );
    }
    return noStore({ draft: result.draft });
  } catch (error) {
    console.error("[external-contacts] parse", error instanceof Error ? error.name : "parse");
    return noStore({ error: "Could not read that." }, 500);
  }
}

import { NextResponse } from "next/server";
import { gptConfigured, parseContactInput } from "@/features/contact-collect/gpt-parse";
import { parseVoiceForm } from "@/features/contact-collect/voice-dialog";
import { requireOwnerId } from "@/shared/services/attachment-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/** Whether photo and voice reading is on. The key itself is never returned. */
export async function GET() {
  const owner = await requireOwnerId();
  if (!owner.ok) return noStore({ error: owner.error }, owner.status);
  return noStore({ available: gptConfigured() });
}

async function bytesOf(value: FormDataEntryValue | null) {
  if (!(value instanceof Blob) || value.size === 0) return null;
  const name = value instanceof File && value.name ? value.name : "recording";
  return { mime: value.type || "", name, bytes: new Uint8Array(await value.arrayBuffer()) };
}

export async function POST(request: Request) {
  const owner = await requireOwnerId();
  if (!owner.ok) return noStore({ error: owner.error }, owner.status);
  const openai = gptConfigured();

  const type = request.headers.get("content-type") ?? "";
  try {
    if (type.includes("multipart/form-data")) {
      if (!openai) return noStore({ error: "Reading is not ready.", available: false }, 503);
      const form = await request.formData();
      const image = await bytesOf(form.get("image"));
      const audio = await bytesOf(form.get("audio"));
      const formField = form.get("form");
      const voiceForm =
        audio && typeof formField === "string" && formField.length <= 20_000 ? parseVoiceForm(formField) : null;
      const result = await parseContactInput({
        openai: true,
        image: image ? { mime: image.mime, bytes: image.bytes } : undefined,
        audio: audio ? { mime: audio.mime, name: audio.name, bytes: audio.bytes } : undefined,
        voiceForm,
      });
      if (!result.ok) {
        return noStore(
          result.available === false ? { error: result.error, available: false } : { error: result.error },
          result.status,
        );
      }
      if ("voice" in result) {
        return noStore(
          typeof result.words === "number" ? { voice: result.voice, words: result.words } : { voice: result.voice },
        );
      }
      return noStore(
        typeof result.words === "number" ? { draft: result.draft, words: result.words } : { draft: result.draft },
      );
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
    if (!("draft" in result)) return noStore({ error: "Could not read that." }, 502);
    return noStore({ draft: result.draft });
  } catch (error) {
    console.error("[external-contacts] parse", error instanceof Error ? error.name : "parse");
    return noStore({ error: "Could not read that." }, 500);
  }
}

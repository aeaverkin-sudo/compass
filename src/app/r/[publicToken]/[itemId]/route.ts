import { NextResponse } from "next/server";
import { publicOrigin } from "@/shared/lib/public-origin";
import { createAdminSupabaseClient } from "@/shared/lib/supabase/admin";
import { isUuid } from "@/shared/services/attachment-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TOKEN_RE = /^[A-Za-z0-9_-]{16,64}$/;

type ItemRow = {
  url: string | null;
  value: string | null;
  attachment_id: string | null;
};

function safeTarget(raw: string | null | undefined): string | null {
  const value = (raw ?? "").trim();
  if (/^https?:\/\//i.test(value)) {
    try {
      const url = new URL(value);
      if (url.protocol !== "http:" && url.protocol !== "https:") return null;
      return url.toString();
    } catch {
      return null;
    }
  }
  if (/^mailto:/i.test(value) || /^tel:/i.test(value)) return value;
  return null;
}

function destination(item: ItemRow, attachmentReady: boolean): string | null {
  if (item.attachment_id && attachmentReady && isUuid(item.attachment_id)) return `/f/${item.attachment_id}`;
  return safeTarget(item.url) ?? safeTarget(item.value);
}

async function recordOpen(cardId: string, itemId: string) {
  try {
    const admin = createAdminSupabaseClient();
    const { error } = await admin
      .from("card_events")
      .insert({ card_id: cardId, type: "attachment_open", item_id: itemId });
    if (!error) return;
    await admin.from("card_events").insert({ card_id: cardId, type: "attachment_open" });
  } catch (error) {
    console.error("[r] attachment_open", error);
  }
}

export async function GET(
  request: Request,
  context: { params: Promise<{ publicToken: string; itemId: string }> },
) {
  const { publicToken, itemId } = await context.params;
  if (!TOKEN_RE.test(publicToken) || !isUuid(itemId)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const admin = createAdminSupabaseClient();
  const card = await admin.from("cards").select("id").eq("public_token", publicToken).maybeSingle();
  if (card.error || !card.data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const link = await admin
    .from("card_items")
    .select("item_id")
    .eq("card_id", card.data.id)
    .eq("item_id", itemId)
    .eq("visible", true)
    .maybeSingle();
  if (link.error || !link.data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const item = await admin.from("items").select("url, value, attachment_id").eq("id", itemId).maybeSingle();
  if (item.error || !item.data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let attachmentReady = false;
  const attachmentId = item.data.attachment_id as string | null;
  if (attachmentId && isUuid(attachmentId)) {
    const file = await admin.from("attachments").select("status").eq("id", attachmentId).maybeSingle();
    attachmentReady = file.data?.status === "ready";
  }

  const target = destination(item.data as ItemRow, attachmentReady);
  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await recordOpen(card.data.id as string, itemId);

  const location = target.startsWith("/") ? new URL(target, publicOrigin(request)) : target;
  return NextResponse.redirect(location, {
    status: 302,
    headers: { "Cache-Control": "no-store" },
  });
}

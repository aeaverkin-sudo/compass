import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/shared/lib/supabase/admin";
import {
  isUuid,
  requireOwnerId,
  safeOriginalName,
  type AttachmentRow,
} from "@/shared/services/attachment-api";
import { finalizePending } from "@/shared/services/attachment-finalize";
import { CARD_ATTACHMENTS_BUCKET } from "@/shared/services/attachment-limits";

export const runtime = "nodejs";

function jsonFail(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}

/**
 * A file row whose upload stopped before finalize.
 * The pending upload is the owner's, carries the row's file name, and sits in the
 * folder of a card that links the row. Its object is confirmed, then linked to the row.
 * No such upload: 404, and the row asks for the file again.
 */
export async function POST(request: Request) {
  const owner = await requireOwnerId();
  if (!owner.ok) return jsonFail(owner.status, owner.error);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonFail(400, "Expected JSON");
  }
  const itemId =
    body && typeof body === "object" && "itemId" in body ? (body as { itemId?: unknown }).itemId : null;
  if (typeof itemId !== "string" || !isUuid(itemId)) return jsonFail(400, "Expected an item id");

  const admin = createAdminSupabaseClient();
  const { data: item, error: itemError } = await admin
    .from("items")
    .select("id, owner_id, value, attachment_id")
    .eq("id", itemId)
    .maybeSingle();
  if (itemError) return jsonFail(500, "Could not read the row");
  if (!item || item.owner_id !== owner.id) return jsonFail(404, "Not found");
  if (item.attachment_id) {
    return NextResponse.json({ attachmentId: item.attachment_id as string });
  }

  const name = safeOriginalName(item.value);
  if (!name) return jsonFail(404, "No stored copy");

  const { data: links, error: linkError } = await admin
    .from("card_items")
    .select("card_id")
    .eq("item_id", itemId);
  if (linkError) return jsonFail(500, "Could not read the row");
  const folders = new Set((links ?? []).map((link) => `${owner.id}/${link.card_id as string}/`));
  if (folders.size === 0) return jsonFail(404, "No stored copy");

  const { data: rows, error: rowError } = await admin
    .from("attachments")
    .select("id, owner_id, bucket, storage_path, mime, byte_size, original_name, status")
    .eq("owner_id", owner.id)
    .eq("bucket", CARD_ATTACHMENTS_BUCKET)
    .eq("status", "pending")
    .eq("original_name", name)
    .order("created_at", { ascending: false });
  if (rowError) return jsonFail(500, "Could not read the file record");

  const candidates = ((rows ?? []) as AttachmentRow[]).filter((row) =>
    [...folders].some((folder) => row.storage_path.startsWith(folder)),
  );

  for (const row of candidates) {
    const result = await finalizePending(row, owner.id);
    if (!result.ok) {
      if (result.status === 504) return jsonFail(504, result.error);
      continue;
    }
    const { data: linked, error: linkFail } = await admin
      .from("items")
      .update({ attachment_id: row.id })
      .eq("id", itemId)
      .eq("owner_id", owner.id)
      .is("attachment_id", null)
      .select("attachment_id")
      .maybeSingle();
    if (linkFail) return jsonFail(500, "Could not link the file");
    if (linked) return NextResponse.json({ attachmentId: linked.attachment_id as string });
    const { data: current } = await admin.from("items").select("attachment_id").eq("id", itemId).maybeSingle();
    return NextResponse.json({ attachmentId: (current?.attachment_id as string | null) ?? row.id });
  }

  return jsonFail(404, "No stored copy");
}

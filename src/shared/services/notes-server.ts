import { nanoid } from "nanoid";
import type { NextScanAddon, NextScanAddonType } from "@/shared/types";
import { createAdminSupabaseClient } from "@/shared/lib/supabase/admin";
import {
  deleteAttachment,
  isUuid,
  loadAttachment,
  removeStoredObject,
} from "@/shared/services/attachment-api";
import { TRANSFER_ASSETS_BUCKET } from "@/shared/services/attachment-limits";
import { orderNextScanAddons } from "@/shared/services/notes-order";

export const NOTES_PENDING_MS = 14 * 24 * 60 * 60 * 1000;
export const NOTE_TEXT_MAX = 280;

export type NoteWrite = {
  type: NextScanAddonType;
  content?: string;
  attachmentId?: string;
};

type TransferRow = {
  id: string;
  status: string;
  expires_at: string;
};

function admin() {
  return createAdminSupabaseClient();
}

export async function cardOwnedBy(cardId: string, ownerId: string): Promise<boolean> {
  if (!isUuid(cardId)) return false;
  const { data, error } = await admin().from("cards").select("owner_id").eq("id", cardId).maybeSingle();
  if (error) throw new Error(error.message);
  return data?.owner_id === ownerId;
}

async function pendingTransfer(cardId: string): Promise<TransferRow | null> {
  const { data, error } = await admin()
    .from("card_transfers")
    .select("id, status, expires_at")
    .eq("card_id", cardId)
    .eq("status", "pending")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as TransferRow | null) ?? null;
}

function stillWaiting(row: TransferRow): boolean {
  return new Date(row.expires_at).getTime() > Date.now();
}

async function expireTransfer(id: string): Promise<void> {
  const { error } = await admin()
    .from("card_transfers")
    .update({ status: "expired" })
    .eq("id", id)
    .eq("status", "pending");
  if (error) throw new Error(error.message);
}

/** The live pending row. An expired one is marked and replaced. */
export async function ensurePendingTransfer(cardId: string): Promise<string> {
  const existing = await pendingTransfer(cardId);
  if (existing && stillWaiting(existing)) return existing.id;
  if (existing) await expireTransfer(existing.id);

  const id = crypto.randomUUID();
  const inserted = await admin()
    .from("card_transfers")
    .insert({
      id,
      card_id: cardId,
      transfer_token: nanoid(21),
      status: "pending",
      expires_at: new Date(Date.now() + NOTES_PENDING_MS).toISOString(),
    })
    .select("id")
    .single();

  if (!inserted.error) return id;
  if (inserted.error.code === "23505") {
    const again = await pendingTransfer(cardId);
    if (again && stillWaiting(again)) return again.id;
  }
  throw new Error(inserted.error.message);
}

async function dropFile(ownerId: string, attachmentId: string, transferId: string): Promise<void> {
  const row = await loadAttachment(attachmentId);
  if (!row || row.owner_id !== ownerId || row.bucket !== TRANSFER_ASSETS_BUCKET) return;
  if (!row.storage_path.startsWith(`${transferId}/`)) return;
  await removeStoredObject(row.storage_path, TRANSFER_ASSETS_BUCKET);
  await deleteAttachment(attachmentId, ownerId);
}

async function itemFiles(transferId: string): Promise<{ id: string; attachment_id: string | null }[]> {
  const { data, error } = await admin()
    .from("transfer_items")
    .select("id, attachment_id")
    .eq("transfer_id", transferId);
  if (error) throw new Error(error.message);
  return (data ?? []) as { id: string; attachment_id: string | null }[];
}

/** Owner removed the notes before anyone opened them. Bytes go with the row. */
async function clearPending(cardId: string, ownerId: string): Promise<void> {
  const existing = await pendingTransfer(cardId);
  if (!existing) return;
  const files = await itemFiles(existing.id);
  const { error } = await admin().from("card_transfers").delete().eq("id", existing.id).eq("status", "pending");
  if (error) throw new Error(error.message);
  for (const file of files) {
    if (file.attachment_id) await dropFile(ownerId, file.attachment_id, existing.id);
  }
}

async function assertTransferFile(ownerId: string, transferId: string, attachmentId: string): Promise<void> {
  if (!isUuid(attachmentId)) throw new Error("Missing file");
  const row = await loadAttachment(attachmentId);
  if (
    !row ||
    row.owner_id !== ownerId ||
    row.bucket !== TRANSFER_ASSETS_BUCKET ||
    row.status !== "ready" ||
    row.storage_path !== `${transferId}/${attachmentId}`
  ) {
    throw new Error("File is not on this note");
  }
}

export async function readPendingNotes(cardId: string): Promise<NextScanAddon[]> {
  const existing = await pendingTransfer(cardId);
  if (!existing || !stillWaiting(existing)) return [];

  const { data, error } = await admin()
    .from("transfer_items")
    .select("id, type, content, attachment_id, sort_order, created_at")
    .eq("transfer_id", existing.id)
    .order("sort_order");
  if (error) throw new Error(error.message);

  const notes: NextScanAddon[] = [];
  for (const row of data ?? []) {
    const type = row.type as NextScanAddonType;
    if (type !== "text" && type !== "selfie" && type !== "voice") continue;
    notes.push({
      id: row.id as string,
      type,
      content: type === "text" ? ((row.content as string | null) ?? "") : "",
      attachmentId: (row.attachment_id as string | null) ?? undefined,
      createdAt: row.created_at as string,
    });
  }
  return orderNextScanAddons(notes);
}

export async function writePendingNotes(cardId: string, ownerId: string, input: NoteWrite[]): Promise<void> {
  const ordered = orderNextScanAddons(
    input.map((note) => ({
      id: note.attachmentId || note.type,
      type: note.type,
      content: note.content ?? "",
      attachmentId: note.attachmentId,
      createdAt: "",
    })),
  );

  if (ordered.length === 0) {
    await clearPending(cardId, ownerId);
    return;
  }

  const transferId = await ensurePendingTransfer(cardId);
  const previous = await itemFiles(transferId);
  const kept = new Set<string>();

  const rows: {
    transfer_id: string;
    type: NextScanAddonType;
    content: string;
    attachment_id: string | null;
    sort_order: number;
  }[] = [];

  for (const [index, note] of ordered.entries()) {
    if (note.type === "text") {
      const content = note.content.trim().slice(0, NOTE_TEXT_MAX);
      if (!content) continue;
      rows.push({
        transfer_id: transferId,
        type: "text",
        content,
        attachment_id: null,
        sort_order: index,
      });
      continue;
    }
    if (!note.attachmentId) continue;
    await assertTransferFile(ownerId, transferId, note.attachmentId);
    kept.add(note.attachmentId);
    rows.push({
      transfer_id: transferId,
      type: note.type,
      content: "",
      attachment_id: note.attachmentId,
      sort_order: index,
    });
  }

  if (rows.length === 0) {
    await clearPending(cardId, ownerId);
    return;
  }

  const { error: deleteError } = await admin().from("transfer_items").delete().eq("transfer_id", transferId);
  if (deleteError) throw new Error(deleteError.message);

  const { error: insertError } = await admin().from("transfer_items").insert(rows);
  if (insertError) throw new Error(insertError.message);

  for (const file of previous) {
    if (file.attachment_id && !kept.has(file.attachment_id)) {
      await dropFile(ownerId, file.attachment_id, transferId);
    }
  }
}

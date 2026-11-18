import { nanoid } from "nanoid";
import type { NextScanAddon, NextScanAddonType } from "@/shared/types";
import { createAdminSupabaseClient } from "@/shared/lib/supabase/admin";
import {
  deleteAttachment,
  isUuid,
  loadAttachment,
  removeStoredObject,
} from "@/shared/services/attachment-api";
import { NOTE_FILE_GRACE_MS, SIGNED_READ_SECONDS, TRANSFER_ASSETS_BUCKET } from "@/shared/services/attachment-limits";
import { isNoteCode } from "@/shared/services/card-handle";
import { orderNextScanAddons } from "@/shared/services/notes-order";
import type { DeliveredNote } from "@/shared/services/notes-types";

export type { DeliveredNote } from "@/shared/services/notes-types";

export const NOTES_PENDING_MS = 7 * 24 * 60 * 60 * 1000;
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
  created_at: string;
  transfer_token: string;
};

/** A link sent before note codes were seven signs. Stored as itself. */
const LEGACY_NOTE_CODE = /^[A-Za-z0-9_-]{21}$/;

/** What the unique column holds. A short code is scoped to this card, so two cards may share it. */
function storedNoteToken(cardId: string, token: string): string | null {
  const raw = token.trim();
  if (isNoteCode(raw)) return `${cardId}:${raw.toLowerCase()}`;
  if (LEGACY_NOTE_CODE.test(raw)) return raw;
  return null;
}

export type CodedNotes = { ready: boolean; notes: DeliveredNote[] };

const NOTES_ARMED = "notes_armed";

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
    .select("id, status, expires_at, created_at, transfer_token")
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

/** The live pending row. An expired one is marked and replaced. A dispatch code, when given, is stored on that row. */
export async function ensurePendingTransfer(cardId: string, token?: string): Promise<string> {
  const code = token ? storedNoteToken(cardId, token) : null;
  const existing = await pendingTransfer(cardId);
  if (existing && stillWaiting(existing)) {
    if (code && existing.transfer_token !== code) {
      const updated = await admin()
        .from("card_transfers")
        .update({ transfer_token: code })
        .eq("id", existing.id)
        .eq("status", "pending");
      if (updated.error) throw new Error(updated.error.message);
    }
    return existing.id;
  }
  if (existing) await expireTransfer(existing.id);

  const id = crypto.randomUUID();
  const inserted = await admin()
    .from("card_transfers")
    .insert({
      id,
      card_id: cardId,
      transfer_token: code ?? nanoid(21),
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

/** The share tap already gave this batch to one link. A scan must not take it too. */
async function notesHeldForLink(cardId: string): Promise<boolean> {
  const existing = await pendingTransfer(cardId);
  if (!existing || !stillWaiting(existing)) return false;
  const { data, error } = await admin()
    .from("card_events")
    .select("id")
    .eq("card_id", cardId)
    .eq("type", NOTES_ARMED)
    .gte("created_at", existing.created_at)
    .limit(1);
  if (error) throw new Error(error.message);
  return (data ?? []).length > 0;
}

/** Share was pressed. The notes stay for one link open and leave the owner's list. */
export async function armPendingNotes(cardId: string): Promise<void> {
  const existing = await pendingTransfer(cardId);
  if (!existing || !stillWaiting(existing)) return;
  if (await notesHeldForLink(cardId)) return;
  const { error } = await admin().from("card_events").insert({ card_id: cardId, type: NOTES_ARMED });
  if (error) throw new Error(error.message);
}

export async function readPendingNotes(cardId: string): Promise<{ notes: NextScanAddon[]; held: boolean }> {
  const existing = await pendingTransfer(cardId);
  if (!existing || !stillWaiting(existing)) return { notes: [], held: false };
  if (await notesHeldForLink(cardId)) return { notes: [], held: true };

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
  return { notes: orderNextScanAddons(notes), held: false };
}

export async function writePendingNotes(
  cardId: string,
  ownerId: string,
  input: NoteWrite[],
  dispatchToken?: string,
): Promise<void> {
  const dispatch = Boolean(dispatchToken && storedNoteToken(cardId, dispatchToken));
  // This batch was already handed to one link. Do not replace it and do not delete it.
  // A Share that is sealing its own code may still write that one row.
  if (!dispatch && (await notesHeldForLink(cardId))) return;
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
    if (dispatch) return;
    await clearPending(cardId, ownerId);
    return;
  }

  const transferId = await ensurePendingTransfer(cardId, dispatch ? dispatchToken : undefined);
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
    if (dispatch) return;
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

async function notesOnTransfer(transferId: string): Promise<DeliveredNote[]> {
  const { data: items, error: itemsError } = await admin()
    .from("transfer_items")
    .select("id, type, content, attachment_id, sort_order")
    .eq("transfer_id", transferId)
    .order("sort_order");
  if (itemsError) throw new Error(itemsError.message);

  const notes: DeliveredNote[] = [];
  for (const row of items ?? []) {
    const type = row.type as NextScanAddonType;
    if (type !== "text" && type !== "selfie" && type !== "voice") continue;

    if (type === "text") {
      notes.push({
        id: row.id as string,
        type,
        content: ((row.content as string | null) ?? "").trim(),
        url: "",
        expired: false,
      });
      continue;
    }

    const attachmentId = row.attachment_id as string | null;
    if (!attachmentId) {
      notes.push({ id: row.id as string, type, content: "", url: "", expired: true });
      continue;
    }

    const file = await loadAttachment(attachmentId);
    if (!file || file.bucket !== TRANSFER_ASSETS_BUCKET || file.status !== "ready") {
      notes.push({
        id: row.id as string,
        type,
        content: "",
        url: "",
        attachmentId,
        expired: true,
      });
      continue;
    }

    const signed = await admin()
      .storage.from(TRANSFER_ASSETS_BUCKET)
      .createSignedUrl(file.storage_path, SIGNED_READ_SECONDS);
    const url = signed.error || !signed.data?.signedUrl ? "" : signed.data.signedUrl;
    notes.push({
      id: row.id as string,
      type,
      content: "",
      url,
      attachmentId,
      expired: !url,
    });
  }

  const ordered = orderNextScanAddons(
    notes.map((note) => ({
      id: note.id,
      type: note.type,
      content: note.content,
      createdAt: "",
    })),
  );
  const byId = new Map(notes.map((note) => [note.id, note]));
  return ordered.flatMap((note) => {
    const full = byId.get(note.id);
    return full ? [full] : [];
  });
}

async function transferByCode(cardId: string, token: string): Promise<TransferRow | null> {
  const { data, error } = await admin()
    .from("card_transfers")
    .select("id, status, expires_at, created_at, transfer_token")
    .eq("card_id", cardId)
    .eq("transfer_token", token)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as TransferRow | null) ?? null;
}

/** Files are stored. The row leaves `pending`, so a new draft can start and an open can burn it. */
export async function sealSentTransfer(cardId: string, token: string): Promise<boolean> {
  const stored = storedNoteToken(cardId, token);
  if (!stored) return false;
  const row = await transferByCode(cardId, stored);
  if (!row || !stillWaiting(row)) return false;
  if (row.status === "sent") return true;
  if (row.status !== "pending") return false;
  const files = await itemFiles(row.id);
  if (files.length === 0) return false;
  const { error } = await admin()
    .from("card_transfers")
    .update({ status: "sent" })
    .eq("id", row.id)
    .eq("status", "pending");
  if (error) throw new Error(error.message);
  return true;
}

/**
 * The link carried a code. A row still `pending` is not burned: the selfie may still be uploading.
 * `burn` is false when the owner opens their own link.
 */
export async function openCodedNotes(cardId: string, token: string, burn: boolean): Promise<CodedNotes> {
  const stored = storedNoteToken(cardId, token);
  if (!stored) return { ready: true, notes: [] };
  const row = await transferByCode(cardId, stored);
  if (!row) return { ready: false, notes: [] };
  if (!stillWaiting(row)) return { ready: true, notes: [] };
  if (row.status === "pending") return { ready: false, notes: [] };
  if (row.status !== "sent") return { ready: true, notes: [] };
  if (!burn) return { ready: true, notes: await notesOnTransfer(row.id) };

  const { data: won, error } = await admin().rpc("consume_sent_transfer", {
    p_token: stored,
    p_card_id: cardId,
  });
  if (error) throw new Error(error.message);
  if (!won || typeof won !== "string") {
    const again = await transferByCode(cardId, stored);
    if (again?.status === "pending" && stillWaiting(again)) return { ready: false, notes: [] };
    return { ready: true, notes: [] };
  }
  const notes = await finishDelivered(cardId, won, "share");
  return { ready: true, notes };
}

/** A link from before codes. Only an armed waiting batch burns. A draft on the card does not. */
export async function consumeLegacyLink(cardId: string): Promise<DeliveredNote[]> {
  if (!(await notesHeldForLink(cardId))) return [];
  return consumePendingNotes(cardId, "share");
}

/** Pending notes for the owner opening their own link. Does not burn the handoff. */
export async function previewPendingNotes(cardId: string): Promise<DeliveredNote[]> {
  const existing = await pendingTransfer(cardId);
  if (!existing || !stillWaiting(existing)) return [];
  return notesOnTransfer(existing.id);
}

/** First handoff wins. Returns notes once; a second call gets []. A scan after Share gets nothing. */
export async function consumePendingNotes(cardId: string, via?: "share" | "qr"): Promise<DeliveredNote[]> {
  if (via === "qr" && (await notesHeldForLink(cardId))) return [];
  const { data: transferId, error } = await admin().rpc("consume_pending_transfer", {
    p_card_id: cardId,
  });
  if (error) throw new Error(error.message);
  if (!transferId || typeof transferId !== "string") return [];
  return finishDelivered(cardId, transferId, via);
}

async function finishDelivered(cardId: string, transferId: string, via?: "share" | "qr"): Promise<DeliveredNote[]> {
  try {
    const event: { card_id: string; type: string; via?: string } = {
      card_id: cardId,
      type: "transfer_consumed",
    };
    if (via) event.via = via;
    const { error: eventError } = await admin().from("card_events").insert(event);
    if (eventError && via) {
      await admin().from("card_events").insert({ card_id: cardId, type: "transfer_consumed" });
    }
  } catch {
    // Visit already counted; delivery is what matters.
  }

  const notes = await notesOnTransfer(transferId);
  try {
    await scheduleDeliveredFiles(transferId);
    const { error: deleteError } = await admin().from("card_transfers").delete().eq("id", transferId);
    if (deleteError) throw new Error(deleteError.message);
  } catch (reason) {
    console.error("[notes] retire delivered transfer", transferId, reason);
  }
  return notes;
}

/** The viewer already holds a signed URL. The bytes wait out that URL, then the cron deletes them. */
async function scheduleDeliveredFiles(transferId: string): Promise<void> {
  const files = await itemFiles(transferId);
  const attachmentIds = files.flatMap((file) => (file.attachment_id ? [file.attachment_id] : []));
  if (attachmentIds.length === 0) return;
  const deleteAfter = new Date(Date.now() + NOTE_FILE_GRACE_MS).toISOString();
  const { error } = await admin()
    .from("attachments")
    .update({ delete_after: deleteAfter })
    .in("id", attachmentIds)
    .eq("bucket", TRANSFER_ASSETS_BUCKET);
  if (error) throw new Error(error.message);
}

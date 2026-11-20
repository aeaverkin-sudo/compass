import { createAdminSupabaseClient } from "@/shared/lib/supabase/admin";
import {
  deleteAttachment,
  insertAttachment,
  isUuid,
  loadAttachment,
  removeStoredObject,
} from "@/shared/services/attachment-api";
import {
  NOTE_FILE_GRACE_MS,
  SIGNED_READ_SECONDS,
  TRANSFER_ASSETS_BUCKET,
} from "@/shared/services/attachment-limits";
import { receiptExpiresAt } from "@/shared/services/note-guest-claim";
import type { DeliveredNote } from "@/shared/services/notes-types";
import { orderNextScanAddons } from "@/shared/services/notes-order";
import type { NextScanAddonType } from "@/shared/types";
import { saveConnection } from "@/shared/services/save-connection";

export type ClaimWinner = {
  guestClaimId: string | null;
  userId: string | null;
};

type ReceiptRow = {
  id: string;
  transfer_id: string;
  card_id: string;
  guest_claim_id: string | null;
  user_id: string | null;
  connection_id: string | null;
  status: string;
  expires_at: string | null;
};

type ReceiptItemRow = {
  id: string;
  type: string;
  content: string;
  source_attachment_id: string | null;
  attachment_id: string | null;
  sort_order: number;
};

function admin() {
  return createAdminSupabaseClient();
}

export function isMissingReceiptSchema(message: string | undefined): boolean {
  return /note_receipts|note_receipt_items|claim_sent_transfer|claim_pending_transfer|could not find the function/i.test(
    message ?? "",
  );
}

function asClaim(data: unknown): { receiptId: string; transferId: string } | null {
  if (!data || typeof data !== "object") return null;
  const row = data as { receipt_id?: unknown; transfer_id?: unknown };
  if (typeof row.receipt_id !== "string" || typeof row.transfer_id !== "string") return null;
  if (!isUuid(row.receipt_id) || !isUuid(row.transfer_id)) return null;
  return { receiptId: row.receipt_id, transferId: row.transfer_id };
}

async function loadReceipt(id: string): Promise<ReceiptRow | null> {
  const { data, error } = await admin()
    .from("note_receipts")
    .select("id, transfer_id, card_id, guest_claim_id, user_id, connection_id, status, expires_at")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    if (isMissingReceiptSchema(error.message)) return null;
    throw new Error(error.message);
  }
  return (data as ReceiptRow | null) ?? null;
}

function claimantOwns(row: ReceiptRow, claim: ClaimWinner): boolean {
  if (claim.userId && row.user_id && row.user_id === claim.userId) return true;
  if (claim.guestClaimId && row.guest_claim_id && row.guest_claim_id === claim.guestClaimId) return true;
  if (claim.userId && row.guest_claim_id && claim.guestClaimId && row.guest_claim_id === claim.guestClaimId) {
    return true;
  }
  return false;
}

/** Open receipts for this card still held by this guest or user. */
export async function findOpenReceiptsForCard(
  cardId: string,
  claim: ClaimWinner,
): Promise<ReceiptRow[]> {
  if (!claim.guestClaimId && !claim.userId) return [];
  const rows: ReceiptRow[] = [];
  if (claim.guestClaimId) {
    const { data, error } = await admin()
      .from("note_receipts")
      .select("id, transfer_id, card_id, guest_claim_id, user_id, connection_id, status, expires_at")
      .eq("card_id", cardId)
      .eq("guest_claim_id", claim.guestClaimId)
      .in("status", ["copying", "ready"]);
    if (error) {
      if (isMissingReceiptSchema(error.message)) return [];
      throw new Error(error.message);
    }
    rows.push(...((data ?? []) as ReceiptRow[]));
  }
  if (claim.userId) {
    const { data, error } = await admin()
      .from("note_receipts")
      .select("id, transfer_id, card_id, guest_claim_id, user_id, connection_id, status, expires_at")
      .eq("card_id", cardId)
      .eq("user_id", claim.userId)
      .in("status", ["copying", "ready"]);
    if (error) {
      if (isMissingReceiptSchema(error.message)) return [];
      throw new Error(error.message);
    }
    for (const row of (data ?? []) as ReceiptRow[]) {
      if (!rows.some((existing) => existing.id === row.id)) rows.push(row);
    }
  }
  return rows.filter((row) => !row.expires_at || new Date(row.expires_at).getTime() > Date.now());
}

async function receiptItems(receiptId: string): Promise<ReceiptItemRow[]> {
  const { data, error } = await admin()
    .from("note_receipt_items")
    .select("id, type, content, source_attachment_id, attachment_id, sort_order")
    .eq("receipt_id", receiptId)
    .order("sort_order");
  if (error) throw new Error(error.message);
  return (data ?? []) as ReceiptItemRow[];
}

async function signAttachment(attachmentId: string | null): Promise<{ url: string; expired: boolean; attachmentId?: string }> {
  if (!attachmentId) return { url: "", expired: true };
  const file = await loadAttachment(attachmentId);
  if (!file || file.bucket !== TRANSFER_ASSETS_BUCKET || file.status !== "ready") {
    return { url: "", expired: true, attachmentId };
  }
  const signed = await admin()
    .storage.from(TRANSFER_ASSETS_BUCKET)
    .createSignedUrl(file.storage_path, SIGNED_READ_SECONDS);
  const url = signed.error || !signed.data?.signedUrl ? "" : signed.data.signedUrl;
  return { url, expired: !url, attachmentId };
}

export async function deliveredFromReceipt(receiptId: string): Promise<DeliveredNote[]> {
  const items = await receiptItems(receiptId);
  const notes: DeliveredNote[] = [];
  for (const row of items) {
    const type = row.type as NextScanAddonType;
    if (type !== "text" && type !== "selfie" && type !== "voice") continue;
    if (type === "text") {
      notes.push({
        id: row.id,
        type,
        content: (row.content ?? "").trim(),
        url: "",
        expired: false,
      });
      continue;
    }
    const liveId = row.attachment_id ?? row.source_attachment_id;
    const signed = await signAttachment(liveId);
    notes.push({
      id: row.id,
      type,
      content: "",
      url: signed.url,
      attachmentId: signed.attachmentId,
      expired: signed.expired,
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

async function copySourceFile(
  receiptId: string,
  sourceAttachmentId: string,
  ownerId: string,
): Promise<string | null> {
  const source = await loadAttachment(sourceAttachmentId);
  if (!source || source.bucket !== TRANSFER_ASSETS_BUCKET || source.status !== "ready") return null;
  const downloaded = await admin().storage.from(source.bucket).download(source.storage_path);
  if (downloaded.error || !downloaded.data) return null;
  const bytes = new Uint8Array(await downloaded.data.arrayBuffer());
  const id = crypto.randomUUID();
  const path = `receipts/${receiptId}/${id}`;
  const uploaded = await admin().storage.from(TRANSFER_ASSETS_BUCKET).upload(path, bytes, {
    contentType: source.mime,
    upsert: false,
  });
  if (uploaded.error) throw new Error(uploaded.error.message);
  await insertAttachment({
    id,
    ownerId,
    path,
    mime: source.mime,
    byteSize: bytes.byteLength,
    originalName: source.original_name,
    status: "ready",
    bucket: TRANSFER_ASSETS_BUCKET,
  });
  // No delete_after: guest TTL lives on the receipt; Network-bound copies do not auto-expire.
  return id;
}

/** Copy missing files for a receipt. Safe to call again. Keeps the source until done. */
export async function completeReceiptCopy(receiptId: string): Promise<void> {
  const receipt = await loadReceipt(receiptId);
  if (!receipt || receipt.status === "bound" || receipt.status === "purged") return;
  if (receipt.status === "ready") return;

  const items = await receiptItems(receiptId);
  const sourceIds = items.flatMap((item) => (item.source_attachment_id ? [item.source_attachment_id] : []));
  let ownerId: string | null = receipt.user_id;
  if (!ownerId && sourceIds.length > 0) {
    const first = await loadAttachment(sourceIds[0]!);
    ownerId = first?.owner_id ?? null;
  }
  if (!ownerId) {
    // Text-only: mark ready and retire the transfer.
    await markReceiptReady(receipt);
    return;
  }

  for (const item of items) {
    if (!item.source_attachment_id || item.attachment_id) continue;
    const copied = await copySourceFile(receiptId, item.source_attachment_id, ownerId);
    if (!copied) throw new Error("Could not copy note file");
    const { error } = await admin()
      .from("note_receipt_items")
      .update({ attachment_id: copied })
      .eq("id", item.id)
      .is("attachment_id", null);
    if (error) throw new Error(error.message);
  }

  await markReceiptReady(receipt);
}

async function markReceiptReady(receipt: ReceiptRow): Promise<void> {
  const { error } = await admin()
    .from("note_receipts")
    .update({ status: "ready" })
    .eq("id", receipt.id)
    .eq("status", "copying");
  if (error) throw new Error(error.message);
  await retireSourceTransfer(receipt.transfer_id);
}

async function retireSourceTransfer(transferId: string): Promise<void> {
  const { data: files, error: filesError } = await admin()
    .from("transfer_items")
    .select("attachment_id")
    .eq("transfer_id", transferId);
  if (filesError) throw new Error(filesError.message);
  const attachmentIds = (files ?? []).flatMap((row) =>
    typeof row.attachment_id === "string" ? [row.attachment_id] : [],
  );
  if (attachmentIds.length > 0) {
    const deleteAfter = new Date(Date.now() + NOTE_FILE_GRACE_MS).toISOString();
    const { error } = await admin()
      .from("attachments")
      .update({ delete_after: deleteAfter })
      .in("id", attachmentIds)
      .eq("bucket", TRANSFER_ASSETS_BUCKET);
    if (error) throw new Error(error.message);
  }
  const { error: deleteError } = await admin().from("card_transfers").delete().eq("id", transferId);
  if (deleteError) throw new Error(deleteError.message);
}

/**
 * Atomic claim for a coded link. On a lost response the same claimant
 * resumes the open receipt; another browser gets nothing.
 */
export async function claimCodedDelivery(
  cardId: string,
  token: string,
  claim: ClaimWinner,
): Promise<{ notes: DeliveredNote[]; ready: boolean; schema: boolean }> {
  if (!claim.guestClaimId && !claim.userId) {
    return { notes: [], ready: true, schema: true };
  }
  const expires = receiptExpiresAt();
  const { data, error } = await admin().rpc("claim_sent_transfer", {
    p_token: token,
    p_card_id: cardId,
    p_guest_claim_id: claim.guestClaimId,
    p_user_id: claim.userId,
    p_expires_at: expires,
  });
  if (error) {
    if (isMissingReceiptSchema(error.message)) {
      return { notes: [], ready: true, schema: false };
    }
    throw new Error(error.message);
  }
  const won = asClaim(data);
  if (won) {
    return finishClaim(won.receiptId, claim);
  }
  return resumeOpen(cardId, claim);
}

export async function claimPendingDelivery(
  cardId: string,
  claim: ClaimWinner,
): Promise<{ notes: DeliveredNote[]; ready: boolean; schema: boolean }> {
  if (!claim.guestClaimId && !claim.userId) {
    return { notes: [], ready: true, schema: true };
  }
  const expires = receiptExpiresAt();
  const { data, error } = await admin().rpc("claim_pending_transfer", {
    p_card_id: cardId,
    p_guest_claim_id: claim.guestClaimId,
    p_user_id: claim.userId,
    p_expires_at: expires,
  });
  if (error) {
    if (isMissingReceiptSchema(error.message)) {
      return { notes: [], ready: true, schema: false };
    }
    throw new Error(error.message);
  }
  const won = asClaim(data);
  if (won) {
    return finishClaim(won.receiptId, claim);
  }
  return resumeOpen(cardId, claim);
}

async function finishClaim(
  receiptId: string,
  claim: ClaimWinner,
): Promise<{ notes: DeliveredNote[]; ready: boolean; schema: boolean }> {
  try {
    await completeReceiptCopy(receiptId);
  } catch (reason) {
    console.error("[notes] receipt copy", receiptId, reason);
  }
  if (claim.userId) {
    try {
      await bindReceiptToUser(receiptId, claim.userId);
    } catch (reason) {
      console.error("[notes] receipt bind", receiptId, reason);
    }
  }
  const notes = await deliveredFromReceipt(receiptId);
  return { notes, ready: true, schema: true };
}

async function resumeOpen(
  cardId: string,
  claim: ClaimWinner,
): Promise<{ notes: DeliveredNote[]; ready: boolean; schema: boolean }> {
  const open = await findOpenReceiptsForCard(cardId, claim);
  if (open.length === 0) return { notes: [], ready: true, schema: true };
  const notes: DeliveredNote[] = [];
  for (const row of open) {
    if (!claimantOwns(row, claim)) continue;
    try {
      await completeReceiptCopy(row.id);
    } catch (reason) {
      console.error("[notes] receipt resume copy", row.id, reason);
    }
    if (claim.userId) {
      try {
        await bindReceiptToUser(row.id, claim.userId);
      } catch (reason) {
        console.error("[notes] receipt resume bind", row.id, reason);
      }
    }
    notes.push(...(await deliveredFromReceipt(row.id)));
  }
  return { notes, ready: true, schema: true };
}

async function reassignCopyOwner(attachmentId: string, userId: string): Promise<void> {
  const { error } = await admin().from("attachments").update({ owner_id: userId, delete_after: null }).eq("id", attachmentId);
  if (error) throw new Error(error.message);
}

async function bindReceiptToUser(receiptId: string, userId: string): Promise<void> {
  const receipt = await loadReceipt(receiptId);
  if (!receipt || receipt.status === "purged") return;
  if (receipt.status === "bound" && receipt.connection_id && receipt.user_id === userId) return;

  if (receipt.status === "copying") {
    await completeReceiptCopy(receiptId);
  }
  const fresh = (await loadReceipt(receiptId)) ?? receipt;
  if (fresh.status !== "ready" && fresh.status !== "bound") return;

  const saved = await saveConnection({ ownerId: userId, cardId: fresh.card_id });
  if (!saved.ok) {
    if (saved.own) return;
    throw new Error(saved.message);
  }

  const connection = await admin()
    .from("connections")
    .select("id")
    .eq("owner_id", userId)
    .eq("saved_card_id", fresh.card_id)
    .maybeSingle();
  if (connection.error) throw new Error(connection.error.message);
  const connectionId = connection.data?.id as string | undefined;
  if (!connectionId) return;

  const items = await receiptItems(receiptId);
  for (const item of items) {
    if (item.attachment_id) await reassignCopyOwner(item.attachment_id, userId);
  }

  const { error } = await admin()
    .from("note_receipts")
    .update({
      user_id: userId,
      connection_id: connectionId,
      status: "bound",
      expires_at: null,
      bound_at: new Date().toISOString(),
    })
    .eq("id", receiptId)
    .in("status", ["ready", "bound"]);
  if (error) throw new Error(error.message);
}

/** After login / Connect: bind every open guest receipt for this browser. */
export async function bindGuestReceipts(userId: string, guestClaimId: string | null): Promise<void> {
  if (!isUuid(userId)) return;
  const open: ReceiptRow[] = [];
  if (guestClaimId) {
    const { data, error } = await admin()
      .from("note_receipts")
      .select("id, transfer_id, card_id, guest_claim_id, user_id, connection_id, status, expires_at")
      .eq("guest_claim_id", guestClaimId)
      .in("status", ["copying", "ready"]);
    if (error) {
      if (isMissingReceiptSchema(error.message)) return;
      throw new Error(error.message);
    }
    open.push(...((data ?? []) as ReceiptRow[]));
  }
  const { data: mine, error: mineError } = await admin()
    .from("note_receipts")
    .select("id, transfer_id, card_id, guest_claim_id, user_id, connection_id, status, expires_at")
    .eq("user_id", userId)
    .in("status", ["copying", "ready"]);
  if (mineError) {
    if (isMissingReceiptSchema(mineError.message)) return;
    throw new Error(mineError.message);
  }
  for (const row of (mine ?? []) as ReceiptRow[]) {
    if (!open.some((existing) => existing.id === row.id)) open.push(row);
  }
  for (const row of open) {
    if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) continue;
    try {
      await bindReceiptToUser(row.id, userId);
    } catch (reason) {
      console.error("[notes] bind guest receipt", row.id, reason);
    }
  }
}

export async function notesForConnection(ownerId: string, connectionId: string): Promise<DeliveredNote[]> {
  const { data, error } = await admin()
    .from("note_receipts")
    .select("id")
    .eq("connection_id", connectionId)
    .eq("user_id", ownerId)
    .eq("status", "bound");
  if (error) {
    if (isMissingReceiptSchema(error.message)) return [];
    throw new Error(error.message);
  }
  const notes: DeliveredNote[] = [];
  for (const row of data ?? []) {
    notes.push(...(await deliveredFromReceipt(row.id as string)));
  }
  return notes;
}

async function dropReceiptFiles(receiptId: string): Promise<void> {
  const items = await receiptItems(receiptId);
  for (const item of items) {
    const id = item.attachment_id;
    if (!id) continue;
    const file = await loadAttachment(id);
    if (!file) continue;
    try {
      await removeStoredObject(file.storage_path, file.bucket);
    } catch (reason) {
      console.error("[notes] drop receipt object", id, reason);
    }
    try {
      await deleteAttachment(id, file.owner_id);
    } catch (reason) {
      console.error("[notes] drop receipt row", id, reason);
    }
  }
}

/** Idempotent: remove Notes files/rows for a connection, then the connection itself. */
export async function deleteOwnedConnection(ownerId: string, connectionId: string): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  if (!isUuid(connectionId) || !isUuid(ownerId)) {
    return { ok: false, status: 404, error: "Not found" };
  }

  const connection = await admin()
    .from("connections")
    .select("id, saved_card_id")
    .eq("id", connectionId)
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (connection.error) throw new Error(connection.error.message);

  const receiptQuery = admin()
    .from("note_receipts")
    .select("id, status")
    .eq("connection_id", connectionId);
  const byConnection = await receiptQuery;
  if (byConnection.error && !isMissingReceiptSchema(byConnection.error.message)) {
    throw new Error(byConnection.error.message);
  }

  const receiptIds = new Set<string>();
  for (const row of byConnection.data ?? []) {
    if (typeof row.id === "string") receiptIds.add(row.id);
  }

  if (connection.data?.saved_card_id) {
    const byCard = await admin()
      .from("note_receipts")
      .select("id")
      .eq("user_id", ownerId)
      .eq("card_id", connection.data.saved_card_id)
      .eq("status", "bound");
    if (byCard.error && !isMissingReceiptSchema(byCard.error.message)) {
      throw new Error(byCard.error.message);
    }
    for (const row of byCard.data ?? []) {
      if (typeof row.id === "string") receiptIds.add(row.id);
    }
  }

  for (const id of receiptIds) {
    await dropReceiptFiles(id);
    const { error } = await admin().from("note_receipts").delete().eq("id", id);
    if (error && !isMissingReceiptSchema(error.message)) throw new Error(error.message);
  }

  if (connection.data) {
    const removed = await admin().from("connections").delete().eq("id", connectionId).eq("owner_id", ownerId);
    if (removed.error) throw new Error(removed.error.message);
  }

  return { ok: true };
}

/** Transfer ids still waiting on a receipt copy — purge must leave their source alone. */
export async function transferIdsHeldByCopying(): Promise<Set<string>> {
  const { data, error } = await admin()
    .from("note_receipts")
    .select("transfer_id")
    .eq("status", "copying");
  if (error) {
    if (isMissingReceiptSchema(error.message)) return new Set();
    throw new Error(error.message);
  }
  return new Set((data ?? []).flatMap((row) => (typeof row.transfer_id === "string" ? [row.transfer_id] : [])));
}

export async function purgeExpiredGuestReceipts(limit = 40): Promise<number> {
  const { data, error } = await admin()
    .from("note_receipts")
    .select("id, transfer_id, status")
    .in("status", ["copying", "ready"])
    .is("connection_id", null)
    .lte("expires_at", new Date().toISOString())
    .limit(limit);
  if (error) {
    if (isMissingReceiptSchema(error.message)) return 0;
    throw new Error(error.message);
  }
  let count = 0;
  for (const row of data ?? []) {
    const id = row.id as string;
    try {
      if (row.status === "copying" && typeof row.transfer_id === "string") {
        // Source may still exist; retire after drop so cron does not keep it forever.
        await dropReceiptFiles(id);
        const { error: del } = await admin().from("note_receipts").delete().eq("id", id);
        if (del) throw new Error(del.message);
        try {
          await retireSourceTransfer(row.transfer_id);
        } catch (reason) {
          console.error("[purge] expired receipt source", row.transfer_id, reason);
        }
      } else {
        await dropReceiptFiles(id);
        const { error: del } = await admin().from("note_receipts").delete().eq("id", id);
        if (del) throw new Error(del.message);
      }
      count += 1;
    } catch (reason) {
      console.error("[purge] guest receipt", id, reason);
    }
  }
  return count;
}

/** Attachment ids still pointed at by receipt items (source or copy). */
export async function receiptReferencedAttachmentIds(ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const used = new Set<string>();
  const { data: copies, error: copyError } = await admin()
    .from("note_receipt_items")
    .select("attachment_id")
    .in("attachment_id", ids);
  if (copyError) {
    if (isMissingReceiptSchema(copyError.message)) return used;
    throw new Error(copyError.message);
  }
  for (const row of copies ?? []) {
    if (typeof row.attachment_id === "string") used.add(row.attachment_id);
  }
  const { data: sources, error: sourceError } = await admin()
    .from("note_receipt_items")
    .select("source_attachment_id")
    .in("source_attachment_id", ids);
  if (sourceError) {
    if (isMissingReceiptSchema(sourceError.message)) return used;
    throw new Error(sourceError.message);
  }
  for (const row of sources ?? []) {
    if (typeof row.source_attachment_id === "string") used.add(row.source_attachment_id);
  }
  // Also protect sources while receipt is still copying: join via receipt status.
  const { data: copying, error: copyingError } = await admin()
    .from("note_receipts")
    .select("id")
    .eq("status", "copying");
  if (copyingError) {
    if (isMissingReceiptSchema(copyingError.message)) return used;
    throw new Error(copyingError.message);
  }
  const copyingIds = (copying ?? []).map((row) => row.id as string);
  if (copyingIds.length === 0) return used;
  const { data: held, error: heldError } = await admin()
    .from("note_receipt_items")
    .select("source_attachment_id")
    .in("receipt_id", copyingIds)
    .in("source_attachment_id", ids);
  if (heldError) {
    if (isMissingReceiptSchema(heldError.message)) return used;
    throw new Error(heldError.message);
  }
  for (const row of held ?? []) {
    if (typeof row.source_attachment_id === "string") used.add(row.source_attachment_id);
  }
  return used;
}

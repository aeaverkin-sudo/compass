import { createBrowserSupabaseClient } from "@/shared/lib/supabase/browser";
import { isVideoMime } from "@/shared/services/attachment-limits";
import { prepareImageUploadBlob } from "@/shared/services/attachment-storage";
import type { ContactType } from "@/shared/types";

export type UploadKind = ContactType | "card-photo";

export type ReadyAttachment = {
  attachmentId: string;
  status: "ready";
  byteSize: number;
};

/**
 * Resolves only after the file is ready.
 * While this promise is in flight the card shows «загружается» and does not
 * store the id — a pending row is not a picture.
 */
export async function uploadAttachment(input: {
  file: File;
  kind: UploadKind;
  cardId?: string;
}): Promise<ReadyAttachment> {
  if (input.kind === "video" || isVideoMime(videoMime(input.file))) {
    return uploadVideo(input.file, input.cardId);
  }
  return uploadBuffered(input.file, input.kind, input.cardId);
}

async function uploadBuffered(
  file: File,
  kind: UploadKind,
  cardId?: string,
): Promise<ReadyAttachment> {
  const body = new FormData();
  const payload =
    kind === "card-photo" || kind === "photo"
      ? await prepareImageUploadBlob(file, kind)
      : file;
  const name = file.name || "file";
  body.append("file", payload, name);
  body.append("kind", kind);
  if (cardId) body.append("cardId", cardId);

  const response = await fetch("/api/attachments", { method: "POST", body });
  return readReady(response);
}

function videoMime(file: File): string {
  if (isVideoMime(file.type)) return file.type;
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext === "mov") return "video/quicktime";
  if (ext === "webm") return "video/webm";
  if (ext === "mp4" || ext === "m4v") return "video/mp4";
  return file.type;
}

async function uploadVideo(file: File, cardId?: string): Promise<ReadyAttachment> {
  const mime = videoMime(file);
  const opened = await fetch("/api/attachments/upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mime,
      byteSize: file.size,
      originalName: file.name,
      cardId,
    }),
  });
  if (!opened.ok) throw new Error(await errorText(opened));

  const ticket = (await opened.json()) as { path?: string; token?: string; attachmentId?: string };
  if (!ticket.path || !ticket.token || !ticket.attachmentId) {
    throw new Error("Could not start the upload");
  }

  const supabase = createBrowserSupabaseClient();
  const uploaded = await supabase.storage
    .from("card-attachments")
    .uploadToSignedUrl(ticket.path, ticket.token, file, { contentType: mime });
  if (uploaded.error) throw new Error(uploaded.error.message);

  const confirmed = await fetch("/api/attachments/finalize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ attachmentId: ticket.attachmentId }),
  });
  return readReady(confirmed);
}

async function readReady(response: Response): Promise<ReadyAttachment> {
  if (!response.ok) throw new Error(await errorText(response));
  const body = (await response.json()) as Partial<ReadyAttachment>;
  if (!body.attachmentId || body.status !== "ready" || typeof body.byteSize !== "number") {
    throw new Error("Upload did not finish");
  }
  return { attachmentId: body.attachmentId, status: "ready", byteSize: body.byteSize };
}

async function errorText(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string };
    return body.error || "Upload failed";
  } catch {
    return "Upload failed";
  }
}

export async function fileFromDataUrl(dataUrl: string, filename: string): Promise<File> {
  const blob = await (await fetch(dataUrl)).blob();
  const mime = blob.type || dataUrl.slice(5, dataUrl.indexOf(";")) || "application/octet-stream";
  return new File([blob], filename, { type: mime });
}

/** Upload leftover data URLs once, then drop them. A failed file stays local and retries next visit. */
export async function migrateLocalMedia(): Promise<void> {
  const { useAppStore } = await import("@/shared/store/app-store");
  const { scheduleItemUpsert } = await import("@/shared/services/card-items-sync");
  const { isAttachmentType } = await import("@/shared/services/portfolio-limits");

  for (const card of useAppStore.getState().cards) {
    const preview = card.photo;
    if (!preview?.startsWith("data:")) continue;
    try {
      const file = await fileFromDataUrl(preview, "card-photo.jpg");
      const ready = await uploadAttachment({ file, kind: "card-photo", cardId: card.id });
      const latest = useAppStore.getState().cards.find((entry) => entry.id === card.id);
      if (latest?.photo !== preview) continue;
      useAppStore.getState().updateCard(card.id, {
        photo: undefined,
        photoAttachmentId: ready.attachmentId,
      });
    } catch (error) {
      console.error("[card-photo] migrate failed", error);
    }
  }

  const cards = useAppStore.getState().cards;
  for (const item of useAppStore.getState().contactItems) {
    const preview = item.url;
    if (!preview.startsWith("data:") || item.attachmentId || !isAttachmentType(item.type)) continue;
    const cardId = cards.find((card) => card.contactItemIds.includes(item.id))?.id;
    try {
      const file = await fileFromDataUrl(preview, item.value || "file");
      const ready = await uploadAttachment({ file, kind: item.type, cardId });
      const nextItems = useAppStore.getState().contactItems.map((entry) =>
        entry.id === item.id && entry.url === preview
          ? { ...entry, attachmentId: ready.attachmentId, url: "" }
          : entry,
      );
      const saved = nextItems.find((entry) => entry.id === item.id);
      if (saved?.attachmentId !== ready.attachmentId) continue;
      useAppStore.setState({ contactItems: nextItems });
      scheduleItemUpsert(saved);
    } catch (error) {
      console.error("[attachment] migrate failed", error);
    }
  }
}

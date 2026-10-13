import { CARD_ATTACHMENTS_BUCKET, isVideoMime } from "@/shared/services/attachment-limits";
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
 * While this promise is in flight the card shows that it is uploading and does not
 * store the id — a pending row is not a picture.
 */
/** Selfie or voice into transfer-assets. The transfer must already be pending. */
export async function uploadTransferAsset(input: {
  file: File;
  kind: "selfie" | "voice";
  transferId: string;
}): Promise<ReadyAttachment> {
  const body = new FormData();
  const payload = input.kind === "selfie" ? await prepareImageUploadBlob(input.file, "photo") : input.file;
  const name = input.file.name || (input.kind === "selfie" ? "selfie.jpg" : "voice");
  body.append("file", payload, name);
  body.append("kind", input.kind);
  body.append("transferId", input.transferId);

  const response = await fetch("/api/attachments", { method: "POST", body });
  return readReady(response);
}

export async function uploadAttachment(input: {
  file: File;
  kind: UploadKind;
  cardId?: string;
  /** PDF and video only: whole percent of bytes sent. */
  onProgress?: (percent: number) => void;
}): Promise<ReadyAttachment> {
  if (input.kind === "pdf") {
    return uploadSigned(input.file, "application/pdf", input.cardId, input.onProgress);
  }
  if (input.kind === "video" || isVideoMime(videoMime(input.file))) {
    return uploadSigned(input.file, videoMime(input.file), input.cardId, input.onProgress);
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

/** Server calls answer within this, or the row turns to Upload failed. */
const API_TIMEOUT_MS = 25_000;
/** The file upload itself may take minutes. It fails only once bytes stop moving. */
const UPLOAD_STALL_MS = 45_000;

async function postJson(path: string, payload: unknown): Promise<Response> {
  try {
    return await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      throw new Error("The server did not answer. Try again.");
    }
    throw new Error("No connection. Try again.");
  }
}

/** Same request as `uploadToSignedUrl`, sent by XHR so the bytes report progress. */
function putSigned(path: string, token: string, file: File, onProgress?: (percent: number) => void) {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!base || !anonKey) return Promise.reject(new Error("Upload is not configured"));
  const encoded = `${CARD_ATTACHMENTS_BUCKET}/${path}`.split("/").map(encodeURIComponent).join("/");
  const url = `${base}/storage/v1/object/upload/sign/${encoded}?token=${encodeURIComponent(token)}`;
  const body = new FormData();
  body.append("cacheControl", "3600");
  body.append("", file);

  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let stall = 0;
    const watch = () => {
      window.clearTimeout(stall);
      stall = window.setTimeout(() => {
        xhr.abort();
        reject(new Error("The upload stopped. Try again."));
      }, UPLOAD_STALL_MS);
    };
    xhr.open("PUT", url);
    xhr.setRequestHeader("apikey", anonKey);
    xhr.setRequestHeader("Authorization", `Bearer ${anonKey}`);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.upload.onprogress = (event) => {
      watch();
      if (event.lengthComputable && event.total > 0) {
        onProgress?.(Math.min(99, Math.floor((event.loaded / event.total) * 100)));
      }
    };
    xhr.onload = () => {
      window.clearTimeout(stall);
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
        return;
      }
      let message = `Storage refused the file (${xhr.status})`;
      try {
        const parsed = JSON.parse(xhr.responseText) as { message?: string; error?: string };
        message = parsed.message || parsed.error || message;
      } catch {
        // Not JSON. The status line is enough.
      }
      reject(new Error(message));
    };
    xhr.onerror = () => {
      window.clearTimeout(stall);
      reject(new Error("Connection lost. Try again."));
    };
    xhr.onabort = () => window.clearTimeout(stall);
    watch();
    xhr.send(body);
  });
}

async function uploadSigned(
  file: File,
  mime: string,
  cardId?: string,
  onProgress?: (percent: number) => void,
): Promise<ReadyAttachment> {
  const opened = await postJson("/api/attachments/upload-url", {
    mime,
    byteSize: file.size,
    originalName: file.name,
    cardId,
  });
  if (!opened.ok) throw new Error(await errorText(opened));

  const ticket = (await opened.json()) as { path?: string; token?: string; attachmentId?: string };
  if (!ticket.path || !ticket.token || !ticket.attachmentId) {
    throw new Error("Could not start the upload");
  }

  await putSigned(ticket.path, ticket.token, file, onProgress);

  const confirmed = await postJson("/api/attachments/finalize", { attachmentId: ticket.attachmentId });
  return readReady(confirmed);
}

/** A file row left without its file. The server links a complete pending upload, if there is one. */
export async function recoverFileRow(itemId: string): Promise<string | null> {
  const response = await postJson("/api/attachments/recover", { itemId });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(await errorText(response));
  const body = (await response.json()) as { attachmentId?: string };
  return body.attachmentId ?? null;
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
      const { scheduleCardUpsert } = await import("@/shared/services/card-sync");
      const next = {
        ...latest,
        photo: undefined,
        photoAttachmentId: ready.attachmentId,
        updatedAt: new Date().toISOString(),
      };
      useAppStore.setState({
        cards: useAppStore.getState().cards.map((entry) => (entry.id === card.id ? next : entry)),
      });
      scheduleCardUpsert(next, { pulse: false });
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
      scheduleItemUpsert(saved, { pulse: false });
    } catch (error) {
      console.error("[attachment] migrate failed", error);
    }
  }
}

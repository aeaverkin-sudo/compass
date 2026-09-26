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

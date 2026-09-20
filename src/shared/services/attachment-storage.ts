import { PORTFOLIO_LIMITS } from "./portfolio-limits";
import type { AttachmentContactType } from "./portfolio-limits";

const HIDDEN_INPUT =
  "pointer-events-none fixed left-0 top-0 h-px w-px overflow-hidden opacity-0";

export async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function compressImageAttachment(file: File): Promise<string> {
  try {
    const bitmap = await createImageBitmap(file);
    const longest = Math.max(bitmap.width, bitmap.height);
    const maxPx = PORTFOLIO_LIMITS.maxAttachmentImagePx;
    const scale = longest > maxPx ? maxPx / longest : 1;
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      return fileToDataUrl(file);
    }

    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const mime = file.type === "image/png" ? "image/png" : "image/jpeg";
    const quality =
      mime === "image/jpeg" ? PORTFOLIO_LIMITS.attachmentJpegQuality : undefined;
    return canvas.toDataURL(mime, quality);
  } catch {
    return fileToDataUrl(file);
  }
}

/** Card avatar — small, for localStorage with two cards. */
export async function prepareCardPhotoForStorage(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) {
    return fileToDataUrl(file);
  }

  try {
    const bitmap = await createImageBitmap(file);
    const longest = Math.max(bitmap.width, bitmap.height);
    const scale = longest > PORTFOLIO_LIMITS.maxCardPhotoPx ? PORTFOLIO_LIMITS.maxCardPhotoPx / longest : 1;
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      return fileToDataUrl(file);
    }

    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    return canvas.toDataURL("image/jpeg", 0.82);
  } catch {
    return fileToDataUrl(file);
  }
}

/** Portfolio attachment — compress images only; other types stored as-is up to limits. */
export async function prepareAttachmentForStorage(
  file: File,
  type: AttachmentContactType,
): Promise<string> {
  if (type === "photo" && file.type.startsWith("image/") && file.type !== "image/svg+xml") {
    return compressImageAttachment(file);
  }
  return fileToDataUrl(file);
}

export { HIDDEN_INPUT };

import { PORTFOLIO_LIMITS } from "./portfolio-limits";
import type { AttachmentContactType } from "./portfolio-limits";

export const HIDDEN_INPUT =
  "pointer-events-none fixed left-0 top-0 h-px w-px overflow-hidden opacity-0";

export async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/** Downscale an image to `maxPx` on its longest side; falls back to the raw data URL. */
async function resizeImageToDataUrl(
  file: File,
  maxPx: number,
  mime: "image/jpeg" | "image/png",
  quality?: number,
): Promise<string> {
  try {
    const bitmap = await createImageBitmap(file);
    const longest = Math.max(bitmap.width, bitmap.height);
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
    return canvas.toDataURL(mime, quality);
  } catch {
    return fileToDataUrl(file);
  }
}

/** Card avatar — small JPEG, sized for localStorage with two cards. */
export async function prepareCardPhotoForStorage(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) {
    return fileToDataUrl(file);
  }
  return resizeImageToDataUrl(
    file,
    PORTFOLIO_LIMITS.maxCardPhotoPx,
    "image/jpeg",
    PORTFOLIO_LIMITS.cardPhotoJpegQuality,
  );
}

/** Portfolio attachment — compress images only; other types stored as-is up to limits. */
export async function prepareAttachmentForStorage(
  file: File,
  type: AttachmentContactType,
): Promise<string> {
  const isImage =
    type === "photo" && file.type.startsWith("image/") && file.type !== "image/svg+xml";
  if (!isImage) {
    return fileToDataUrl(file);
  }
  const mime = file.type === "image/png" ? "image/png" : "image/jpeg";
  return resizeImageToDataUrl(
    file,
    PORTFOLIO_LIMITS.maxAttachmentImagePx,
    mime,
    mime === "image/jpeg" ? PORTFOLIO_LIMITS.attachmentJpegQuality : undefined,
  );
}

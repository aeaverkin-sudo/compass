import { detectAttachmentType } from "@/shared/services/portfolio-catalog";
import { PORTFOLIO_DOCUMENT_ACCEPT } from "@/shared/services/portfolio-catalog";
import {
  HIDDEN_INPUT,
  prepareAttachmentForStorage,
  prepareCardPhotoForStorage,
} from "@/shared/services/attachment-storage";

export { HIDDEN_INPUT };

/** @deprecated Use prepareCardPhotoForStorage — kept for imports. */
export const preparePhotoForStorage = prepareCardPhotoForStorage;

export async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function mountPickerInput(accept: string, capture?: "user" | "environment") {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = accept;
  if (capture) input.capture = capture;
  input.className = HIDDEN_INPUT;
  input.tabIndex = -1;
  input.setAttribute("aria-hidden", "true");
  document.body.appendChild(input);
  return input;
}

function openFileInputPicker(
  accept: string,
  prepare: (file: File) => Promise<string>,
  onPhoto: (photo: string, file: File) => void,
  onDismiss?: () => void,
  capture?: "user" | "environment",
) {
  const input = mountPickerInput(accept, capture);
  let closed = false;

  const close = () => {
    if (closed) return;
    closed = true;
    window.removeEventListener("focus", onWindowFocus);
    input.remove();
    onDismiss?.();
  };

  const onWindowFocus = () => {
    window.setTimeout(close, 300);
  };

  input.addEventListener(
    "change",
    () => {
      const file = input.files?.[0];
      if (file) {
        void prepare(file)
          .then((photo) => onPhoto(photo, file))
          .finally(close);
      } else {
        close();
      }
    },
    { once: true },
  );

  window.addEventListener("focus", onWindowFocus);
  input.click();
}

export function openSelfiePicker(
  onPhoto: (photo: string, file: File) => void,
  onDismiss?: () => void,
) {
  openFileInputPicker("image/*", prepareCardPhotoForStorage, onPhoto, onDismiss, "user");
}

/** Photo library — no capture, no image/* wildcard (avoids iOS camera sheet). */
export function openGalleryPicker(
  onPhoto: (photo: string, file: File) => void,
  onDismiss?: () => void,
) {
  openFileInputPicker(
    "image/jpeg,image/png,image/heic,image/heif,image/webp",
    (file) => prepareAttachmentForStorage(file, "photo"),
    onPhoto,
    onDismiss,
  );
}

/** Portfolio files — PDF, office docs, media, images. */
export function openDocumentPicker(
  onPhoto: (photo: string, file: File) => void,
  onDismiss?: () => void,
) {
  openFileInputPicker(
    PORTFOLIO_DOCUMENT_ACCEPT,
    (file) => prepareAttachmentForStorage(file, detectAttachmentType(file)),
    onPhoto,
    onDismiss,
  );
}

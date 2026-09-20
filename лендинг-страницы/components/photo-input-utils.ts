import { detectAttachmentType } from "@/shared/services/portfolio-catalog";
import {
  PORTFOLIO_FILE_ACCEPT,
  PORTFOLIO_GALLERY_ACCEPT,
} from "@/shared/services/portfolio-catalog";
import {
  HIDDEN_INPUT,
  prepareAttachmentForStorage,
  prepareCardPhotoForStorage,
} from "@/shared/services/attachment-storage";

type PhotoHandler = (photo: string, file: File) => void;
type Prepare = (file: File) => Promise<string>;

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
  prepare: Prepare,
  onPhoto: PhotoHandler,
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
  // Must run synchronously in the tap handler — iOS drops user activation otherwise.
  input.click();
}

/** Card avatar — front camera. */
export function openSelfiePicker(onPhoto: PhotoHandler, onDismiss?: () => void) {
  openFileInputPicker("image/*", prepareCardPhotoForStorage, onPhoto, onDismiss, "user");
}

/** Card avatar — native iOS sheet (Photo Library / Take Photo / Choose File). */
export function openNativePhotoPicker(onPhoto: PhotoHandler, onDismiss?: () => void) {
  openFileInputPicker("image/*", prepareCardPhotoForStorage, onPhoto, onDismiss);
}

/** Portfolio attachment — photo library; images compressed to attachment size. */
export function openGalleryPicker(onPhoto: PhotoHandler, onDismiss?: () => void) {
  openFileInputPicker(
    PORTFOLIO_GALLERY_ACCEPT,
    (file) => prepareAttachmentForStorage(file, "photo"),
    onPhoto,
    onDismiss,
  );
}

/** Portfolio attachment — Files app; PDF, office docs, media (no image types). */
export function openDocumentPicker(onPhoto: PhotoHandler, onDismiss?: () => void) {
  openFileInputPicker(
    PORTFOLIO_FILE_ACCEPT,
    (file) => prepareAttachmentForStorage(file, detectAttachmentType(file)),
    onPhoto,
    onDismiss,
  );
}

import { detectAttachmentType } from "@/shared/services/portfolio-catalog";
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
    input.remove();
    onDismiss?.();
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
  // A tap beside the iOS menu fires `cancel`. A window focus event also fires while the
  // menu is still open, and treating that as a dismiss drops the keyboard a moment later.
  input.addEventListener("cancel", close, { once: true });

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

function openPreparedAttachment(accept: string, onPhoto: PhotoHandler, onDismiss?: () => void) {
  openFileInputPicker(
    accept,
    (file) => prepareAttachmentForStorage(file, detectAttachmentType(file)),
    onPhoto,
    onDismiss,
  );
}

/** Its own input. Photos and videos only, so iOS opens the library rather than a shared file picker. No capture. */
export function openContactPhotoPicker(onPhoto: PhotoHandler, onDismiss?: () => void) {
  openPreparedAttachment("image/*,video/*", onPhoto, onDismiss);
}

/** A different input. Documents only, so iOS opens Files. */
export function openContactFilePicker(onPhoto: PhotoHandler, onDismiss?: () => void) {
  openPreparedAttachment(".pdf,.doc,.docx,.ppt,.pptx", onPhoto, onDismiss);
}

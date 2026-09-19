const HIDDEN_INPUT =
  "pointer-events-none fixed left-0 top-0 h-px w-px overflow-hidden opacity-0";

/** Keeps card photos small enough for localStorage with two cards. */
const MAX_PHOTO_PX = 512;
const JPEG_QUALITY = 0.82;

export async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export async function preparePhotoForStorage(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) {
    return fileToDataUrl(file);
  }

  try {
    const bitmap = await createImageBitmap(file);
    const longest = Math.max(bitmap.width, bitmap.height);
    const scale = longest > MAX_PHOTO_PX ? MAX_PHOTO_PX / longest : 1;
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

    return canvas.toDataURL("image/jpeg", JPEG_QUALITY);
  } catch {
    return fileToDataUrl(file);
  }
}

/** Create on demand — a permanent capture="user" input can keep iOS camera indicator lit. */
export function mountSelfieInput() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.capture = "user";
  input.className = HIDDEN_INPUT;
  input.tabIndex = -1;
  input.setAttribute("aria-hidden", "true");
  document.body.appendChild(input);
  return input;
}

export function openSelfiePicker(onPhoto: (photo: string) => void) {
  const input = mountSelfieInput();
  let closed = false;

  const close = () => {
    if (closed) return;
    closed = true;
    window.removeEventListener("focus", onDismiss);
    input.remove();
  };

  const onDismiss = () => {
    window.setTimeout(close, 300);
  };

  input.addEventListener(
    "change",
    () => {
      const file = input.files?.[0];
      if (file) {
        void preparePhotoForStorage(file).then(onPhoto).finally(close);
      } else {
        close();
      }
    },
    { once: true },
  );

  window.addEventListener("focus", onDismiss);
  input.click();
}

export { HIDDEN_INPUT };

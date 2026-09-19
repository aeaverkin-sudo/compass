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
        void fileToDataUrl(file).then(onPhoto).finally(close);
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

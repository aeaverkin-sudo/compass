import { cn } from "@/lib/utils";

export type PhotoLook = "frame" | "shadow";

export function photoLookValue(value: unknown): PhotoLook | undefined {
  return value === "frame" || value === "shadow" ? value : undefined;
}

/** Outline or soft shadow. Absent is the plain square. */
export function photoSlotLookClass(look?: PhotoLook) {
  return cn(
    look === "frame" && "border border-[#d4d4d4]",
    look === "shadow" && "shadow-[0_2px_8px_rgba(17,17,17,0.16)]",
  );
}

/**
 * html2canvas-pro does not rasterize this box-shadow.
 * Soft slabs, shifted down, sit in the padding under the photo and do rasterize.
 */
export function applyPdfPhotoLook(root: HTMLElement) {
  for (const image of root.querySelectorAll("img")) {
    if (!(image instanceof HTMLImageElement)) continue;
    const shadow = getComputedStyle(image).boxShadow;
    if (!shadow || shadow === "none" || image.dataset.pdfPhotoShadow === "1") continue;
    const width = image.offsetWidth || image.clientWidth;
    const height = image.offsetHeight || image.clientHeight;
    const host = shadowHost(image, root, height);
    if (!host || width < 1 || height < 1) continue;
    image.dataset.pdfPhotoShadow = "1";
    image.style.position = "relative";
    image.style.zIndex = "1";
    image.style.boxShadow = "none";
    if (getComputedStyle(host).position === "static") host.style.position = "relative";
    const origin = host.getBoundingClientRect();
    const rect = image.getBoundingClientRect();
    const left = rect.left - origin.left;
    const top = rect.top - origin.top;
    for (let step = 8; step >= 1; step -= 1) {
      const bleed = Math.round(step / 2);
      const slab = document.createElement("span");
      slab.setAttribute("aria-hidden", "true");
      slab.style.position = "absolute";
      slab.style.left = `${left - bleed}px`;
      slab.style.top = `${top + step}px`;
      slab.style.width = `${width + bleed * 2}px`;
      slab.style.height = `${height}px`;
      slab.style.background = "rgba(17,17,17,0.035)";
      slab.style.pointerEvents = "none";
      slab.style.zIndex = "0";
      host.insertBefore(slab, host.firstChild);
    }
  }
}

function shadowHost(image: HTMLImageElement, root: HTMLElement, height: number): HTMLElement | null {
  let node = image.parentElement;
  while (node) {
    if (node.clientHeight >= height + 8) return node;
    if (node === root) break;
    node = node.parentElement;
  }
  return image.parentElement;
}

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

const EDGE_PROBE_PX = 64;
const EDGE_RING = 0.06;
const EDGE_LIGHT_SHARE = 0.85;

/**
 * The square's edge would vanish on white: the outer ring is mostly white or see-through.
 * An image the canvas cannot draw counts as not light.
 */
export async function hasLightEdges(file: File): Promise<boolean> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, EDGE_PROBE_PX / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) {
      bitmap.close();
      return false;
    }
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const { data } = context.getImageData(0, 0, width, height);
    const ring = Math.max(1, Math.round(Math.max(width, height) * EDGE_RING));
    let total = 0;
    let light = 0;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (x >= ring && x < width - ring && y >= ring && y < height - ring) continue;
        const at = (y * width + x) * 4;
        total += 1;
        if (data[at + 3]! < 16 || (data[at]! > 240 && data[at + 1]! > 240 && data[at + 2]! > 240)) light += 1;
      }
    }
    return total > 0 && light / total >= EDGE_LIGHT_SHARE;
  } catch {
    return false;
  }
}

/** The photo's shadow on the side rail. Absent is Basic. */
export function railLookClass(look?: "shadow") {
  return cn(look === "shadow" && "shadow-[0_2px_8px_rgba(17,17,17,0.16)]");
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

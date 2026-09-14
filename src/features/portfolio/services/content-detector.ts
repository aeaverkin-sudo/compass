import type { ContentType } from "@/shared/types";

const SOCIAL_HOSTS = [
  "linkedin.com",
  "instagram.com",
  "twitter.com",
  "x.com",
  "facebook.com",
  "spotify.com",
  "github.com",
  "youtube.com",
  "tiktok.com",
];

export function detectContentType(input: string, mimeType?: string): ContentType {
  const trimmed = input.trim();
  if (!trimmed) return "empty";

  if (mimeType === "application/pdf" || trimmed.startsWith("data:application/pdf")) {
    return "pdf";
  }
  if (mimeType?.startsWith("image/") || /^data:image\//.test(trimmed)) {
    return "image";
  }

  try {
    const url = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
    if (url.protocol === "http:" || url.protocol === "https:") {
      return "link";
    }
  } catch {
    /* not a url */
  }

  if (/\.(pdf)$/i.test(trimmed)) return "pdf";
  if (/\.(jpg|jpeg|png|gif|webp|heic)$/i.test(trimmed)) return "image";

  return "text";
}

export function deriveLabel(value: string, type: ContentType, existingLabel?: string): string {
  if (existingLabel && existingLabel !== "Add anything..." && !existingLabel.startsWith("Add file")) {
    return existingLabel;
  }

  if (type === "link") {
    try {
      const url = new URL(value.startsWith("http") ? value : `https://${value}`);
      const host = url.hostname.replace("www.", "");
      if (SOCIAL_HOSTS.some((h) => host.includes(h))) {
        const part = host.split(".")[0];
        return part.charAt(0).toUpperCase() + part.slice(1);
      }
      return host;
    } catch {
      return "Link";
    }
  }

  if (type === "pdf") return "PDF";
  if (type === "image") return "Photo";
  if (type === "text") return value.slice(0, 32) + (value.length > 32 ? "…" : "");

  return existingLabel || "Add anything...";
}

export function isSlotFilled(slot: { type: ContentType; value: string }): boolean {
  return slot.type !== "empty" && slot.value.trim().length > 0;
}

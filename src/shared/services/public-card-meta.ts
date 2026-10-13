import type { Metadata } from "next";
import { headers } from "next/headers";
import type { PublicCard } from "@/shared/services/public-card";
import { publicCardPreviewVersion } from "@/shared/services/public-card-url";

const PUBLIC_ORIGIN = "https://adedme.com";

function forwardedHost(value: string | null): string | null {
  const host = value?.split(",")[0]?.trim() ?? "";
  if (!host) return null;
  const name = host.split(":")[0]?.toLowerCase() ?? "";
  if (name === "localhost" || name === "127.0.0.1" || name.endsWith(".local")) return null;
  return host;
}

export async function requestOrigin(): Promise<string> {
  const headerList = await headers();
  const host = forwardedHost(headerList.get("x-forwarded-host") ?? headerList.get("host"));
  if (!host) return PUBLIC_ORIGIN;
  const proto = headerList.get("x-forwarded-proto")?.split(",")[0]?.trim() || "https";
  return `${proto}://${host}`;
}

/** Link preview: name, role, and the card photo. */
export async function metadataForPublicCard(loaded: PublicCard | null, path: string): Promise<Metadata> {
  if (!loaded) return { title: "ADED" };
  const origin = await requestOrigin();
  const title = loaded.card.displayName.trim() || "ADED";
  const description = loaded.card.title.trim();
  const v = publicCardPreviewVersion(loaded.card);
  const image = loaded.card.photoAttachmentId
    ? `${origin}/f/${loaded.card.photoAttachmentId}?v=${v}`
    : `${origin}/og/card-blank`;
  return {
    title,
    description: description || undefined,
    openGraph: {
      title,
      description: description || undefined,
      url: `${origin}${path}`,
      type: "website",
      images: image ? [{ url: image, alt: title }] : undefined,
    },
    twitter: {
      card: loaded.card.photoAttachmentId ? "summary_large_image" : "summary",
      title,
      description: description || undefined,
      images: image ? [image] : undefined,
    },
  };
}

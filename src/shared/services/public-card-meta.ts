import type { Metadata } from "next";
import { headers } from "next/headers";
import type { PublicCard } from "@/shared/services/public-card";

export async function requestOrigin(): Promise<string> {
  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host");
  const proto = headerList.get("x-forwarded-proto") ?? "https";
  if (!host) return "https://www.adedme.com";
  return `${proto}://${host}`;
}

/** Link preview: name, role, and the card photo. */
export async function metadataForPublicCard(loaded: PublicCard | null, path: string): Promise<Metadata> {
  if (!loaded) return { title: "ADED" };
  const origin = await requestOrigin();
  const title = loaded.card.displayName.trim() || "ADED";
  const description = loaded.card.title.trim();
  const image = loaded.card.photoAttachmentId ? `${origin}/f/${loaded.card.photoAttachmentId}` : undefined;
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
  };
}

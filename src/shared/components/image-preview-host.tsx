"use client";

import { useEffect, useState } from "react";
import { BackButton } from "@/shared/components/back-button";
import { HEADER_ROW_PX } from "@/shared/layout/axes";
import { SCREEN_TOP_AXIS_PX } from "@main/layout";

type ImagePreview = { url: string; name: string };

/** A picture from a card stays in the app. The chevron returns to the card. */
export function openAttachmentImage(url: string, name: string) {
  if (typeof window === "undefined" || !url) return false;
  const label = name.trim() || "Image";
  window.dispatchEvent(new CustomEvent("compass-image-preview", { detail: { url, name: label } }));
  return true;
}

export function ImagePreviewHost() {
  const [image, setImage] = useState<ImagePreview | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const onPreview = (event: Event) => {
      const detail = (event as CustomEvent<ImagePreview>).detail;
      if (!detail?.url) return;
      setFailed(false);
      setImage(detail);
    };
    window.addEventListener("compass-image-preview", onPreview);
    return () => window.removeEventListener("compass-image-preview", onPreview);
  }, []);

  useEffect(() => {
    if (!image) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setImage(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [image]);

  if (!image) return null;

  return (
    <div className="fixed inset-0 z-50 bg-white">
      <BackButton fallbackHref="/" onBack={() => setImage(null)} />
      <div
        className="flex h-full items-center justify-center overflow-auto px-[var(--gutter)] pb-[max(1.5rem,env(safe-area-inset-bottom))]"
        style={{ paddingTop: `calc(env(safe-area-inset-top) + ${SCREEN_TOP_AXIS_PX + HEADER_ROW_PX / 2}px)` }}
      >
        {failed ? (
          <p className="text-center t-body text-[var(--ink)]">Could not open this image.</p>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image.url}
            alt={image.name}
            className="max-h-full max-w-full object-contain"
            onError={() => setFailed(true)}
          />
        )}
      </div>
    </div>
  );
}

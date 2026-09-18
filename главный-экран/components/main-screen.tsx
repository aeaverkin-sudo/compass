"use client";

import { useEffect, useMemo } from "react";
import { useShareSync } from "../hooks/use-share-sync";
import { isCardReady, useAppStore } from "@/shared/store/app-store";
import { BusinessCard } from "./business-card";
import { ContentSheetPeek } from "./content-sheet-peek";
import { QrZone } from "./qr-zone";

function buildPdfUrl(token: string) {
  if (typeof window === "undefined") {
    return `/api/share/${token}/pdf`;
  }
  return `${window.location.origin}/api/share/${token}/pdf`;
}

export function MainScreen() {
  const card = useAppStore((state) => state.card);
  const contactItems = useAppStore((state) => state.contactItems);
  const shareToken = useAppStore((state) => state.user.shareToken);

  useShareSync();

  const pdfUrl = useMemo(() => buildPdfUrl(shareToken), [shareToken]);

  useEffect(() => {
    document.documentElement.classList.add("compass-ready");

    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      meta.setAttribute(
        "content",
        getComputedStyle(document.documentElement).getPropertyValue("--theme-color-ready").trim() ||
          "#f9f8f6",
      );
    }
  }, []);

  if (!card) {
    return <div className="h-lvh bg-background" aria-hidden />;
  }

  return (
    <main className="compass-main grid h-lvh grid-rows-[20fr_65fr_15fr] overflow-hidden bg-background">
      <QrZone url={pdfUrl} visible={isCardReady(card)} />

      <div className="min-h-0">
        <BusinessCard card={card} library={contactItems} />
      </div>

      <ContentSheetPeek />
    </main>
  );
}

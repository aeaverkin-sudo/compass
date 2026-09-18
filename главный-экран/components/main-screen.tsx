"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type MainScreenMode } from "../layout";
import { useMainLayout } from "../hooks/use-main-layout";
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
  const [mode, setMode] = useState<MainScreenMode>("browse");

  const fullCardRef = useRef<HTMLElement>(null);
  const compactCardRef = useRef<HTMLElement>(null);
  const [fullCardHeight, setFullCardHeight] = useState(0);
  const [compactCardHeight, setCompactCardHeight] = useState(0);

  useShareSync();

  const pdfUrl = useMemo(() => buildPdfUrl(shareToken), [shareToken]);
  const layout = useMainLayout(fullCardHeight, compactCardHeight);

  const toggleMode = useCallback(() => {
    setMode((current) => (current === "browse" ? "library" : "browse"));
  }, []);

  useEffect(() => {
    const fullNode = fullCardRef.current;
    const compactNode = compactCardRef.current;
    if (!fullNode || !compactNode) return;

    const sync = () => {
      setFullCardHeight(fullNode.offsetHeight);
      setCompactCardHeight(compactNode.offsetHeight);
    };

    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(fullNode);
    observer.observe(compactNode);

    return () => observer.disconnect();
  }, [card, contactItems]);

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

  const cardOnTop = mode === "browse";
  const edgeInset = layout?.edgeInsetPx ?? 0;
  const cardTop = layout
    ? mode === "browse"
      ? layout.cardTopBrowse
      : layout.cardTopLibrary
    : -9999;

  return (
    <main className="compass-main relative h-lvh overflow-hidden bg-background">
      {/* Off-screen measurers — drive layout math */}
      <div className="pointer-events-none invisible absolute -left-[9999px] top-0 w-[min(100vw,480px)]" aria-hidden>
        <BusinessCard
          ref={fullCardRef}
          card={card}
          library={contactItems}
          mode="browse"
          onEmptyAreaTap={() => undefined}
        />
        <BusinessCard
          ref={compactCardRef}
          card={card}
          library={contactItems}
          mode="library"
          onEmptyAreaTap={() => undefined}
        />
      </div>

      {/* Layer 0 — permanent background */}
      <div className="pointer-events-none absolute inset-0 z-0 bg-background">
        {layout ? <QrZone url={pdfUrl} visible={isCardReady(card)} top={layout.qrTop} /> : null}
      </div>

      {/* Layer 1 — content sheet */}
      {layout ? (
        <div className="absolute inset-x-0 bottom-0" style={{ zIndex: cardOnTop ? 10 : 30 }}>
          <ContentSheetPeek
            mode={mode}
            edgeInsetPx={layout.edgeInsetPx}
            sheetTopLibrary={layout.sheetTopLibrary}
            onTap={toggleMode}
          />
        </div>
      ) : null}

      {/* Layer 2 — business card */}
      {layout ? (
        <div
          className="absolute transition-[top] duration-[460ms] ease-out"
          style={{
            left: edgeInset,
            right: edgeInset,
            top: cardTop,
            zIndex: cardOnTop ? 20 : 25,
          }}
        >
          <BusinessCard
            card={card}
            library={contactItems}
            mode={mode}
            onEmptyAreaTap={toggleMode}
          />
        </div>
      ) : null}
    </main>
  );
}

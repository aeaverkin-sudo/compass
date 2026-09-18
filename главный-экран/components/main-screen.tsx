"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { layoutTop, type MainScreenMode } from "../layout";
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

  if (!card) {
    return <div className="fixed inset-0 bg-background-ready" aria-hidden />;
  }

  const cardOnTop = mode === "browse";
  const edgeInset = layout
    ? mode === "browse"
      ? layout.edgeInsetBrowse
      : layout.edgeInsetLibrary
    : 20;
  const cardTop = layout
    ? mode === "browse"
      ? layout.cardTopBrowse
      : layout.cardTopLibrary
    : undefined;

  return (
    <main className="compass-main fixed inset-0 overflow-hidden bg-background-ready">
      {/* Off-screen measurers */}
      <div className="pointer-events-none invisible absolute -left-[9999px] top-0" aria-hidden>
        <div style={{ width: layout ? `calc(100vw - ${layout.edgeInsetBrowse * 2}px)` : "calc(100vw - 40px)" }}>
          <BusinessCard
            ref={fullCardRef}
            card={card}
            library={contactItems}
            mode="browse"
            onEmptyAreaTap={() => undefined}
          />
        </div>
        <div style={{ width: layout ? `calc(100vw - ${layout.edgeInsetLibrary * 2}px)` : "calc(100vw - 28px)" }}>
          <BusinessCard
            ref={compactCardRef}
            card={card}
            library={contactItems}
            mode="library"
            onEmptyAreaTap={() => undefined}
          />
        </div>
      </div>

      {/* Layer 0 — permanent background */}
      <div className="pointer-events-none absolute inset-0 z-0 bg-background-ready">
        {layout ? (
          <QrZone url={pdfUrl} visible={isCardReady(card)} topOffsetPx={layout.qrTop} />
        ) : null}
      </div>

      {/* Layer 1 — content sheet (full viewport containing block) */}
      {layout ? (
        <div className="pointer-events-none absolute inset-0" style={{ zIndex: cardOnTop ? 10 : 30 }}>
          <ContentSheetPeek
            mode={mode}
            edgeInsetPx={mode === "browse" ? layout.edgeInsetBrowse : layout.edgeInsetLibrary}
            topBrowse={layoutTop(layout.sheetTopBrowse)}
            topLibrary={layoutTop(layout.sheetTopLibrary)}
            onTap={toggleMode}
          />
        </div>
      ) : null}

      {/* Layer 2 — business card */}
      {layout && cardTop !== undefined ? (
        <div
          className="absolute transition-[top,left,right] duration-[460ms] ease-out"
          style={{
            left: edgeInset,
            right: edgeInset,
            top: layoutTop(cardTop),
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

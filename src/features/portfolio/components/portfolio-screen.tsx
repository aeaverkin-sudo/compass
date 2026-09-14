"use client";

import { useCallback, useEffect, useState } from "react";
import { useAppStore } from "@/shared/store/app-store";
import { TIER_LIMITS } from "@/shared/constants/tiers";
import {
  buildPortfolioSnapshot,
  isQrReady,
} from "@/features/portfolio/services/portfolio-factory";
import { PortfolioQR } from "./portfolio-qr";
import { PortfolioPreview } from "./portfolio-preview";
import { ContentWheel } from "./content-wheel";

export function PortfolioScreen() {
  const portfolios = useAppStore((s) => s.portfolios);
  const contentLibrary = useAppStore((s) => s.contentLibrary);
  const currentIndex = useAppStore((s) => s.currentPortfolioIndex);
  const user = useAppStore((s) => s.user);
  const qrFlashKey = useAppStore((s) => s.qrFlashKey);

  const setCurrentPortfolioIndex = useAppStore((s) => s.setCurrentPortfolioIndex);
  const addPortfolio = useAppStore((s) => s.addPortfolio);
  const updatePortfolio = useAppStore((s) => s.updatePortfolio);
  const addLibrarySlot = useAppStore((s) => s.addLibrarySlot);
  const updateLibrarySlot = useAppStore((s) => s.updateLibrarySlot);
  const deleteLibrarySlot = useAppStore((s) => s.deleteLibrarySlot);
  const addSlotToPortfolio = useAppStore((s) => s.addSlotToPortfolio);
  const removeSlotFromPortfolio = useAppStore((s) => s.removeSlotFromPortfolio);
  const triggerQrFlash = useAppStore((s) => s.triggerQrFlash);

  const [shareTokens, setShareTokens] = useState<Record<string, string>>({});
  const [limitHint, setLimitHint] = useState(false);

  const portfolio = portfolios[currentIndex];
  const limits = TIER_LIMITS[user.tier];
  const qrVisible = portfolio ? isQrReady(portfolio) : false;

  const syncShareToken = useCallback(async () => {
    if (!portfolio || !qrVisible) return;
    const snapshot = buildPortfolioSnapshot(portfolio, contentLibrary);
    const res = await fetch("/api/share", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ portfolio: snapshot, ownerName: user.name }),
    });
    const { token } = await res.json();
    setShareTokens((prev) => ({ ...prev, [portfolio.id]: token }));
  }, [portfolio, contentLibrary, qrVisible, user.name]);

  const libraryFingerprint = contentLibrary
    .map((s) => `${s.id}:${s.value}:${s.type}`)
    .join("|");

  useEffect(() => {
    syncShareToken();
  }, [
    syncShareToken,
    portfolio?.updatedAt,
    portfolio?.activeSlotIds.join(","),
    libraryFingerprint,
  ]);

  useEffect(() => {
    if (portfolio && qrVisible) triggerQrFlash();
  }, [currentIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  const shareToken = portfolio ? shareTokens[portfolio.id] : "";
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const pdfShareUrl = shareToken ? `${origin}/share/${shareToken}?pdf=1` : "";
  const linkShareUrl = shareToken ? `${origin}/share/${shareToken}` : "";

  const handleShare = async () => {
    if (!portfolio || !linkShareUrl) return;
    try {
      const title = [portfolio.firstName, portfolio.lastName].filter(Boolean).join(" ");
      if (navigator.share) {
        await navigator.share({ title, text: portfolio.description, url: linkShareUrl });
      } else {
        await navigator.clipboard.writeText(linkShareUrl);
        alert("Link copied");
      }
    } catch {
      /* cancelled */
    }
  };

  const handleToggleActive = (slotId: string) => {
    if (!portfolio) return;
    if (portfolio.activeSlotIds.includes(slotId)) {
      removeSlotFromPortfolio(portfolio.id, slotId);
    } else {
      addSlotToPortfolio(portfolio.id, slotId);
    }
  };

  if (!portfolio) return null;

  return (
    <div className="compass-main mx-auto flex h-[calc(100dvh-5rem)] max-w-lg flex-col overflow-hidden bg-[#faf9f7]">
      {/* Zone 1 — QR (fixed, no scroll) */}
      <section className="shrink-0 touch-none border-b border-[#1a1a1a]/10">
        <PortfolioQR url={pdfShareUrl} visible={qrVisible} flashKey={qrFlashKey} />
      </section>

      {/* Zone 2 — Preview (fixed height, swipe only — no scroll drag) */}
      <section className="shrink-0 touch-none">
        <PortfolioPreview
          portfolios={portfolios}
          currentIndex={currentIndex}
          library={contentLibrary}
          onIndexChange={setCurrentPortfolioIndex}
          onUpdate={updatePortfolio}
          onAddPortfolio={() => {
            if (!addPortfolio()) setLimitHint(true);
          }}
          onShare={handleShare}
          shareReady={Boolean(linkShareUrl)}
        />
      </section>

      {/* Zone 3 — Content wheel (only inner list scrolls) */}
      <section className="flex min-h-0 flex-1 flex-col overflow-hidden border-t border-[#1a1a1a]/10">
        <ContentWheel
          portfolio={portfolio}
          library={contentLibrary}
          onAddSlot={() => {
            if (!addLibrarySlot()) setLimitHint(true);
          }}
          onUpdateSlot={(id, data) => {
            updateLibrarySlot(id, data);
            updatePortfolio(portfolio.id, { updatedAt: new Date().toISOString() });
            triggerQrFlash();
          }}
          onDeleteSlot={deleteLibrarySlot}
          onToggleActive={handleToggleActive}
          slotLimitReached={contentLibrary.length >= limits.maxSlots}
        />
      </section>

      {limitHint && (
        <div className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 border border-[#1a1a1a]/10 bg-[#faf9f7] px-4 py-2 text-[12px] text-[#666]">
          {limits.label} limit reached — change tier in Settings
          <button type="button" className="ml-2 underline" onClick={() => setLimitHint(false)}>
            OK
          </button>
        </div>
      )}
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { Share2 } from "lucide-react";
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

  const shareUrl =
    portfolio && shareTokens[portfolio.id]
      ? `${typeof window !== "undefined" ? window.location.origin : ""}/share/${shareTokens[portfolio.id]}`
      : "";

  const handleShare = async () => {
    if (!portfolio || !shareUrl) return;
    try {
      if (navigator.share) {
        await navigator.share({
          title: portfolio.name,
          text: [portfolio.firstName, portfolio.lastName].filter(Boolean).join(" "),
          url: shareUrl,
        });
      } else {
        await navigator.clipboard.writeText(shareUrl);
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
    <div className="compass-main mx-auto flex min-h-[calc(100vh-5rem)] max-w-lg flex-col bg-[#faf9f7]">
      {/* Zone 1 — QR */}
      <section className="shrink-0 border-b border-[#1a1a1a]/10">
        <PortfolioQR url={shareUrl} visible={qrVisible} flashKey={qrFlashKey} />
        {qrVisible && (
          <div className="flex justify-center gap-4 pb-3">
            <button
              type="button"
              onClick={handleShare}
              className="flex items-center gap-1.5 text-[11px] tracking-wide text-[#666] uppercase"
            >
              <Share2 className="h-3.5 w-3.5" />
              Share
            </button>
          </div>
        )}
      </section>

      {/* Zone 2 — Preview (horizontal swipe) */}
      <section className="shrink-0">
        <PortfolioPreview
          portfolios={portfolios}
          currentIndex={currentIndex}
          library={contentLibrary}
          onIndexChange={setCurrentPortfolioIndex}
          onUpdate={updatePortfolio}
          onAddPortfolio={() => {
            if (!addPortfolio()) setLimitHint(true);
          }}
        />
      </section>

      {/* Zone 3 — Content wheel (global library) */}
      <section className="flex min-h-0 flex-1 flex-col border-t border-[#1a1a1a]/10">
        <ContentWheel
          portfolio={portfolio}
          library={contentLibrary}
          onAddSlot={() => {
            if (!addLibrarySlot()) setLimitHint(true);
          }}
          onUpdateSlot={(id, data) => {
            updateLibrarySlot(id, data);
            updatePortfolio(portfolio.id, {});
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

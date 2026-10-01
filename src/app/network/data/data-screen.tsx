"use client";

import { useEffect, useState } from "react";
import { BackButton } from "@/shared/components/back-button";
import { useCardsHydrated } from "@/shared/hooks/use-cards-hydrated";
import { useAppStore } from "@/shared/store/app-store";
import { NetworkTabs } from "../network-tabs";

const LABEL =
  "text-[11px] leading-[1.45] font-normal tracking-[0.1em] text-[#999] uppercase";

const FROZEN = { filter: "blur(4.5px)", opacity: 0.42 } as const;

type CardData = {
  shared: number;
  opens: number;
  saved: number;
};

function Metric({ value, label, rule = true }: { value: string; label: string; rule?: boolean }) {
  return (
    <div className={rule ? "border-b-[0.5px] border-[#111] py-[18px]" : "py-[18px]"}>
      <p className="text-[32px] leading-none font-light text-[#111]">{value}</p>
      <p className={`mt-2 ${LABEL}`}>{label}</p>
    </div>
  );
}

export function DataScreen() {
  const hydrated = useCardsHydrated();
  const cardId = useAppStore((state) => state.cards[state.currentCardIndex]?.id ?? state.cards[0]?.id ?? "");
  const [stats, setStats] = useState<CardData | null>(null);

  useEffect(() => {
    if (!hydrated) return;
    const query = cardId ? `?card=${encodeURIComponent(cardId)}` : "";
    let cancel = false;
    void fetch(`/api/network/data${query}`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return null;
        return (await response.json()) as CardData;
      })
      .then((body) => {
        if (!cancel && body && typeof body.shared === "number") setStats(body);
      })
      .catch(() => undefined);
    return () => {
      cancel = true;
    };
  }, [hydrated, cardId]);

  const shown = (value: number | undefined) => (stats && value !== undefined ? String(value) : "…");

  return (
    <main className="compass-main flex h-dvh flex-col overflow-hidden bg-white text-[#111]">
      <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-[max(2.5rem,env(safe-area-inset-bottom))]">
        <BackButton fallbackHref="/network" />
        <div className="mt-10 mb-[18px] grid h-[22px] grid-cols-[44px_minmax(0,1fr)_44px] items-center">
          <span aria-hidden className="size-[22px]" />
          <h1 className="text-center text-[13px] leading-none font-normal tracking-[0.2em] text-[#999] uppercase">
            Data
          </h1>
        </div>

        <Metric value={shown(stats?.shared)} label="Shared" />
        <Metric value={shown(stats?.opens)} label="Opens" />
        <Metric value={shown(stats?.saved)} label="Saved" rule={false} />

        <div className="mt-8">
          <p className={LABEL}>Available in Pro</p>
          <div className="mt-3 border-t-[0.5px] border-[#111]" />
          <div className="py-[18px]">
            <p className={LABEL}>Link opens</p>
            <ul className="mt-3 text-[15.5px] leading-[1.45] font-normal text-[#111]" style={FROZEN} aria-hidden>
              <li>Behance</li>
              <li>Telegram</li>
              <li>Portfolio.pdf</li>
            </ul>
          </div>
          <div className="border-t-[0.5px] border-[#111] py-[18px]">
            <p className={LABEL}>Repeat visits</p>
            <p className="mt-3 text-[32px] leading-none font-light text-[#111]" style={FROZEN} aria-hidden>
              18
            </p>
          </div>
        </div>
      </div>
      <NetworkTabs active="data" />
    </main>
  );
}

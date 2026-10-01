"use client";

import { useEffect, useState, type ReactNode } from "react";
import { BackButton } from "@/shared/components/back-button";
import { useCardsHydrated } from "@/shared/hooks/use-cards-hydrated";
import { useAppStore } from "@/shared/store/app-store";
import { NetworkTabs } from "../network-tabs";

const LABEL = "text-[11px] leading-[1.45] font-normal tracking-[0.1em] text-[#999] uppercase";

type LinkOpen = {
  label: string;
  count: number;
};

type CardData = {
  shared: number;
  opens: number;
  opensViaQr: number;
  saved: number;
  linkOpens: LinkOpen[];
  repeatVisits: number;
};

function Metric({
  value,
  label,
  note,
  rule = true,
  children,
}: {
  value: string;
  label: string;
  note?: string;
  rule?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className={rule ? "border-b-[0.5px] border-[#111] py-[18px]" : "py-[18px]"}>
      <p className="text-[32px] leading-none font-light text-[#111]">{value}</p>
      <p className={`mt-2 ${LABEL}`}>{label}</p>
      {note ? <p className="mt-1 text-[13px] leading-[1.45] font-normal text-[#999]">{note}</p> : null}
      {children}
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
        if (!cancel && body && typeof body.shared === "number" && typeof body.opens === "number") setStats(body);
      })
      .catch(() => undefined);
    return () => {
      cancel = true;
    };
  }, [hydrated, cardId]);

  const shown = (value: number | undefined) => (stats && value !== undefined ? String(value) : "…");
  const links = stats?.linkOpens ?? [];

  return (
    <main className="compass-main flex h-dvh flex-col overflow-hidden bg-white text-[#111]">
      <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-[max(2.5rem,env(safe-area-inset-bottom))]">
        <BackButton fallbackHref="/network" />
        <div className="mt-10 mb-[18px] grid h-[22px] grid-cols-[44px_minmax(0,1fr)_44px] items-center">
          <span aria-hidden className="size-[22px]" />
          <h1 className="text-center text-[14px] leading-[1.45] font-normal tracking-[0.1em] text-[#111] uppercase">
            Data
          </h1>
        </div>

        <Metric value={shown(stats?.shared)} label="Shared" />
        <Metric
          value={shown(stats?.opens)}
          label="Opens"
          note={stats ? `${stats.opensViaQr} via QR` : undefined}
        />
        <Metric value={shown(stats?.saved)} label="Saved" />
        <Metric value={shown(stats ? links.reduce((sum, row) => sum + row.count, 0) : undefined)} label="Link opens">
          {links.length > 0 ? (
            <ul className="mt-3">
              {links.map((row, index) => (
                <li
                  key={`${row.label}-${index}`}
                  className="flex items-baseline justify-between gap-4 text-[15.5px] leading-[1.45] font-normal tracking-[-0.015em] text-[#111]"
                >
                  <span className="min-w-0 truncate">{row.label}</span>
                  <span>{row.count}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </Metric>
        <Metric value={shown(stats?.repeatVisits)} label="Repeat visits" rule={false} />
      </div>
      <NetworkTabs />
    </main>
  );
}

"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ScreenHeader } from "@/shared/components/screen-header";
import { Zone } from "@/shared/components/zone";
import { useCardsHydrated } from "@/shared/hooks/use-cards-hydrated";
import { useAppStore } from "@/shared/store/app-store";
import { NetworkBand } from "../network-band";

type LinkOpen = {
  label: string;
  count: number;
};

type CardData = {
  shared: number;
  opens: number;
  totalOpens: number;
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
  note?: string | string[];
  rule?: boolean;
  children?: ReactNode;
}) {
  const notes = note == null ? [] : Array.isArray(note) ? note : [note];
  return (
    <Zone label={label} rule={rule}>
      <p className="text-[32px] leading-none font-normal tracking-[-0.03em] text-[var(--ink)] tabular-nums">{value}</p>
      {notes.map((line, index) => (
        <p key={`${line}-${index}`} className="mt-1 t-meta text-[var(--grey)]">
          {line}
        </p>
      ))}
      {children}
    </Zone>
  );
}

export function DataScreen() {
  const router = useRouter();
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
        if (
          !cancel &&
          body &&
          typeof body.shared === "number" &&
          typeof body.opens === "number" &&
          typeof body.totalOpens === "number"
        ) {
          setStats(body);
        }
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
      <div className="min-h-0 flex-1 overflow-y-auto px-[var(--gutter)] pb-[max(2.5rem,env(safe-area-inset-bottom))]">
        <ScreenHeader title="Data" fallbackHref="/main" onBack={() => router.push("/main")} />

        <Metric value={shown(stats?.shared)} label="Shared" />
        <Metric
          value={shown(stats?.opens)}
          label="Opens"
          note={stats ? [`${stats.opensViaQr} via QR`, `${stats.totalOpens} total`] : undefined}
        />
        <Metric value={shown(stats?.saved)} label="Saved" />
        <Metric value={shown(stats ? links.reduce((sum, row) => sum + row.count, 0) : undefined)} label="Link opens">
          {links.length > 0 ? (
            <ul className="mt-3">
              {links.map((row, index) => (
                <li
                  key={`${row.label}-${index}`}
                  className="flex items-baseline justify-between gap-4 t-body text-[var(--ink)]"
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
      <NetworkBand current="data" />
    </main>
  );
}

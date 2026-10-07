"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ScreenHeader } from "@/shared/components/screen-header";
import { Zone } from "@/shared/components/zone";
import { useCardsHydrated } from "@/shared/hooks/use-cards-hydrated";
import { useAppStore } from "@/shared/store/app-store";
import type { CardData } from "@/shared/services/card-stats";
import { NetworkBand } from "../network-band";

function isCardData(value: unknown): value is CardData {
  if (!value || typeof value !== "object") return false;
  const row = value as CardData;
  return typeof row.shared === "number" && typeof row.opens === "number" && typeof row.totalOpens === "number";
}

/** No events on this card. Saved counts the whole account, so it does not keep the zeros on screen. */
function isQuiet(stats: CardData) {
  return (
    stats.shared === 0 &&
    stats.totalOpens === 0 &&
    stats.repeatVisits === 0 &&
    (stats.linkOpens?.length ?? 0) === 0
  );
}

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

function PortfolioStats({ name, stats }: { name: string; stats: CardData | null }) {
  const shown = (value: number | undefined) => (stats && value !== undefined ? String(value) : "…");
  const links = stats?.linkOpens ?? [];

  return (
    <>
      <Zone label="Portfolio" rule>
        <p className="t-body break-words text-[var(--ink)]">{name}</p>
      </Zone>
      {stats && isQuiet(stats) ? (
        <p className="py-[18px] t-meta text-[var(--grey)]">
          No activity yet. Stats appear once your card is shared or opened.
        </p>
      ) : (
        <>
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
        </>
      )}
    </>
  );
}

export function DataScreen() {
  const router = useRouter();
  const hydrated = useCardsHydrated();
  const cards = useAppStore((state) => state.cards);
  const currentCardIndex = useAppStore((state) => state.currentCardIndex);
  const setCurrentCardIndex = useAppStore((state) => state.setCurrentCardIndex);
  const index = cards.length === 0 ? 0 : Math.min(currentCardIndex, cards.length - 1);
  const [cache, setCache] = useState<Record<string, CardData>>({});
  const cacheRef = useRef(cache);
  const pending = useRef(new Set<string>());
  const scroller = useRef<HTMLDivElement>(null);
  const placed = useRef(false);
  const [width, setWidth] = useState(0);
  const many = cards.length > 1;
  const activeId = cards[index]?.id ?? "";

  useEffect(() => {
    cacheRef.current = cache;
  }, [cache]);

  useEffect(() => {
    if (!hydrated || !activeId || cacheRef.current[activeId] || pending.current.has(activeId)) return;
    pending.current.add(activeId);
    const cardId = activeId;
    void fetch(`/api/network/data?card=${encodeURIComponent(cardId)}`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return null;
        return response.json() as Promise<unknown>;
      })
      .then((body) => {
        pending.current.delete(cardId);
        if (!isCardData(body)) return;
        const next = { ...cacheRef.current, [cardId]: body };
        cacheRef.current = next;
        setCache(next);
      })
      .catch(() => {
        pending.current.delete(cardId);
      });
  }, [hydrated, activeId]);

  useLayoutEffect(() => {
    const node = scroller.current;
    if (!node || !many) return;
    const sync = () => setWidth(node.clientWidth);
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(node);
    return () => observer.disconnect();
  }, [many]);

  useLayoutEffect(() => {
    const previous = history.scrollRestoration;
    history.scrollRestoration = "manual";
    return () => {
      history.scrollRestoration = previous;
    };
  }, []);

  useLayoutEffect(() => {
    const node = scroller.current;
    if (!node || !many || width === 0) return;
    const target = index * width;
    if (!placed.current || Math.abs(node.scrollLeft - target) >= width * 0.75) {
      node.scrollTo({ left: target, behavior: "auto" });
    }
    placed.current = true;
  }, [index, many, width]);

  const onScroll = () => {
    const node = scroller.current;
    if (!placed.current || !node || !many || width === 0) return;
    const next = Math.min(cards.length - 1, Math.max(0, Math.round(node.scrollLeft / width)));
    if (next === index) return;
    setCurrentCardIndex(next);
  };

  const counter =
    many ? (
      <span className="t-label tabular-nums">
        {index + 1} / {cards.length}
      </span>
    ) : null;

  const slide = (card: { id: string; displayName: string } | null) => (
    <PortfolioStats name={card?.displayName.trim() ?? ""} stats={card ? (cache[card.id] ?? null) : null} />
  );

  return (
    <main className="compass-main flex h-dvh flex-col overflow-hidden bg-white text-[var(--ink)]">
      <div className="shrink-0 px-[var(--gutter)]">
        <ScreenHeader
          title="Data"
          fallbackHref="/main"
          onBack={() => router.push("/main")}
          trailing={counter}
        />
      </div>
      {many ? (
        <div
          ref={scroller}
          className="compass-carousel min-h-0 flex-1 snap-x snap-mandatory overflow-x-auto overflow-y-hidden"
          onScroll={onScroll}
        >
          <div className="flex h-full">
            {cards.map((card) => (
              <div
                key={card.id}
                className="h-full shrink-0 snap-center overflow-y-auto px-[var(--gutter)] pb-[max(2.5rem,env(safe-area-inset-bottom))]"
                style={{ width: width || "100%", touchAction: "pan-y" }}
              >
                {slide(card)}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto px-[var(--gutter)] pb-[max(2.5rem,env(safe-area-inset-bottom))]">
          {slide(cards[0] ?? null)}
        </div>
      )}
      <NetworkBand current="data" />
    </main>
  );
}

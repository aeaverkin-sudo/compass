"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useRouter } from "next/navigation";
import { ScreenHeader } from "@/shared/components/screen-header";
import { Zone } from "@/shared/components/zone";
import { useCardsHydrated } from "@/shared/hooks/use-cards-hydrated";
import { useAppStore } from "@/shared/store/app-store";
import type { CardData } from "@/shared/services/card-stats";
import { NUMBER_CLASS } from "@/shared/components/section-number";
import type { Card } from "@/shared/types";
import { NetworkBand } from "../network-band";

const ACTION =
  "press w-[160px] border-0 bg-sky px-[21.6px] py-[10.8px] text-center t-caps text-[var(--ink)]";

function dayLabel(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(date);
}

function cacheKey(cardId: string, history: boolean) {
  return history ? `${cardId}:all` : cardId;
}

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
      <p className={NUMBER_CLASS}>{value}</p>
      {notes.map((line, index) => (
        <p key={`${line}-${index}`} className="mt-1 t-meta text-[var(--grey)]">
          {line}
        </p>
      ))}
      {children}
    </Zone>
  );
}

function PortfolioStats({
  name,
  createdAt,
  stats,
  history,
  onReset,
  onHistory,
}: {
  name: string;
  createdAt?: string;
  stats: CardData | null;
  history: boolean;
  onReset: () => void;
  onHistory: () => void;
}) {
  const shown = (value: number | undefined) => (stats && value !== undefined ? String(value) : "…");
  const links = stats?.linkOpens ?? [];
  const quiet = Boolean(stats && isQuiet(stats) && !stats.since);
  const sinceDay = stats?.since ? dayLabel(stats.since) : "";
  const born = createdAt ? dayLabel(createdAt) : "";
  const note = history ? (born ? `All time · since ${born}` : "All time") : sinceDay ? `Since ${sinceDay}` : "";

  return (
    <>
      <Zone label="Portfolio" rule>
        <p className="t-body break-words text-[var(--ink)]">{name}</p>
      </Zone>
      {note ? <p className="mt-[18px] t-meta text-[var(--grey)]">{note}</p> : null}
      {quiet ? (
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
      {history ? null : (
        <div className="flex flex-col items-center gap-[10px] pt-[18px]">
          <button type="button" className={ACTION} onClick={onReset}>
            Reset
          </button>
          <button type="button" className={ACTION} onClick={onHistory}>
            History
          </button>
        </div>
      )}
    </>
  );
}

export function DataScreen({ history = false }: { history?: boolean }) {
  const router = useRouter();
  const hydrated = useCardsHydrated();
  const cards = useAppStore((state) => state.cards);
  const currentCardIndex = useAppStore((state) => state.currentCardIndex);
  const setCurrentCardIndex = useAppStore((state) => state.setCurrentCardIndex);
  const index = cards.length === 0 ? 0 : Math.min(currentCardIndex, cards.length - 1);
  const [cache, setCache] = useState<Record<string, CardData>>({});
  const cacheRef = useRef(cache);
  const pending = useRef(new Set<string>());
  const [resetId, setResetId] = useState<string | null>(null);
  const [resetBusy, setResetBusy] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const syncing = useRef(false);
  const [width, setWidth] = useState(0);
  const many = cards.length > 1;
  const activeId = cards[index]?.id ?? "";

  useEffect(() => {
    cacheRef.current = cache;
  }, [cache]);

  useEffect(() => {
    if (!hydrated || !activeId) return;
    const key = cacheKey(activeId, history);
    if (cacheRef.current[key] || pending.current.has(key)) return;
    pending.current.add(key);
    const cardId = activeId;
    void fetch(`/api/network/data?card=${encodeURIComponent(cardId)}${history ? "&all=1" : ""}`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return null;
        return response.json() as Promise<unknown>;
      })
      .then((body) => {
        pending.current.delete(key);
        if (!isCardData(body)) return;
        const next = { ...cacheRef.current, [key]: body };
        cacheRef.current = next;
        setCache(next);
      })
      .catch(() => {
        pending.current.delete(key);
      });
  }, [hydrated, activeId, history]);

  const confirmReset = async () => {
    if (!resetId || resetBusy) return;
    const cardId = resetId;
    setResetBusy(true);
    try {
      const response = await fetch(`/api/network/data?card=${encodeURIComponent(cardId)}`, {
        method: "POST",
        cache: "no-store",
      });
      const body = response.ok ? ((await response.json().catch(() => null)) as { ok?: boolean } | null) : null;
      if (body?.ok === true && isCardData(body)) {
        const next = { ...cacheRef.current, [cardId]: body };
        cacheRef.current = next;
        setCache(next);
      }
    } catch {
      // A failed reset leaves the numbers as they were.
    }
    setResetBusy(false);
    setResetId(null);
  };

  useLayoutEffect(() => {
    const node = scroller.current;
    if (!node || !many) return;
    const sync = () => {
      const next = node.clientWidth;
      if (next > 0) setWidth((current) => (current === next ? current : next));
    };
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(node);
    return () => observer.disconnect();
  }, [many]);

  useLayoutEffect(() => {
    const previous = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";
    return () => {
      window.history.scrollRestoration = previous;
    };
  }, []);

  useLayoutEffect(() => {
    const node = scroller.current;
    if (!node || !many || width === 0) return;
    const target = index * width;
    if (Math.abs(node.scrollLeft - target) <= 1) {
      syncing.current = false;
      return;
    }
    syncing.current = true;
    node.scrollTo({ left: target, behavior: "auto" });
    const release = window.setTimeout(() => {
      syncing.current = false;
    }, 80);
    return () => window.clearTimeout(release);
  }, [index, many, width]);

  const onScroll = () => {
    const node = scroller.current;
    if (!node || syncing.current || !many) return;
    const slideWidth = node.clientWidth;
    if (slideWidth <= 0) return;
    const next = Math.min(cards.length - 1, Math.max(0, Math.round(node.scrollLeft / slideWidth)));
    if (next === useAppStore.getState().currentCardIndex) return;
    setCurrentCardIndex(next);
  };

  const counter =
    many ? (
      <span className="t-label tabular-nums">
        {index + 1} / {cards.length}
      </span>
    ) : null;

  const slide = (card: Card | null) => (
    <PortfolioStats
      name={card?.displayName.trim() ?? ""}
      createdAt={card?.createdAt}
      history={history}
      stats={card ? (cache[cacheKey(card.id, history)] ?? null) : null}
      onReset={() => {
        if (card) setResetId(card.id);
      }}
      onHistory={() => router.push("/network/data/history")}
    />
  );

  return (
    <main className="compass-main flex h-dvh flex-col overflow-hidden bg-white text-[var(--ink)]">
      <div className="shrink-0 px-[var(--gutter)]">
        <ScreenHeader
          title={history ? "History" : "Data"}
          fallbackHref={history ? "/network/data" : "/main"}
          onBack={() => router.push(history ? "/network/data" : "/main")}
          trailing={counter}
        />
      </div>
      {many ? (
        <div
          ref={scroller}
          className="min-h-0 w-full min-w-0 flex-1 snap-x snap-mandatory overflow-x-auto overflow-y-hidden overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          onScroll={onScroll}
        >
          {width > 0 ? (
            <div className="flex h-full">
              {cards.map((card) => (
                <div
                  key={card.id}
                  className="h-full shrink-0 snap-start overflow-y-auto px-[var(--gutter)] pb-[max(2.5rem,env(safe-area-inset-bottom))]"
                  style={{ width, touchAction: "pan-x pan-y" }}
                >
                  {slide(card)}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto px-[var(--gutter)] pb-[max(2.5rem,env(safe-area-inset-bottom))]">
          {slide(cards[0] ?? null)}
        </div>
      )}
      <NetworkBand current="data" />
      {history ? null : (
        <Dialog.Root
          open={resetId !== null}
          onOpenChange={(next) => {
            if (resetBusy) return;
            if (!next) setResetId(null);
          }}
        >
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-50 bg-transparent" />
            <Dialog.Content className="fixed top-1/2 left-1/2 z-50 w-max max-w-[min(100%-48px,280px)] -translate-x-1/2 -translate-y-1/2 bg-sky px-5 py-4 text-center outline-none">
              <Dialog.Title className="t-body text-[var(--ink)]">Start counting from now?</Dialog.Title>
              <Dialog.Description className="mt-2 t-meta text-[var(--grey)]">
                Numbers here go to zero. History keeps everything.
              </Dialog.Description>
              <div className="mt-3 flex justify-center gap-6">
                <button
                  type="button"
                  disabled={resetBusy}
                  className="t-body text-[var(--ink)] disabled:text-[var(--grey)]"
                  onClick={() => void confirmReset()}
                >
                  Yes
                </button>
                <button
                  type="button"
                  disabled={resetBusy}
                  className="t-body text-[var(--grey)]"
                  onClick={() => setResetId(null)}
                >
                  No
                </button>
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      )}
    </main>
  );
}

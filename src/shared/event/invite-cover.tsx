"use client";

import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { AdedWordmark } from "@/shared/components/aded-wordmark";
import { fitTitle, type FittedTitle } from "@/shared/event/fit-title";
import type { EventLayoutId, EventThemeId } from "@/shared/event/themes";
import { dottedDate, eventClock, eventYear, fashionWhen, formatEventWhen, romanYear } from "@/shared/event/when";

const CARD_W = 260;
const CARD_H = 390;

const HAIRLINE = "color-mix(in srgb, currentColor 35%, transparent)";

export type InviteCoverEvent = {
  name: string;
  description: string | null;
  date: string | null;
  place: string | null;
  placeSecret: boolean;
  logoUrl: string | null;
};

type InviteCoverProps = {
  event: InviteCoverEvent;
  layout: EventLayoutId;
  themeId: EventThemeId;
  variant: "page" | "preview" | "card";
};

function placeLine(event: InviteCoverEvent): string | null {
  if (event.placeSecret) return "Revealed closer to the date";
  const place = event.place?.trim();
  return place || null;
}

function aboutLine(event: InviteCoverEvent): string | null {
  const text = event.description?.trim();
  return text || null;
}

export function InviteCover({ event, layout, themeId, variant }: InviteCoverProps) {
  const board = <CoverBoard event={event} layout={layout} themeId={themeId} variant={variant} />;
  if (variant === "preview") return <PreviewFrame>{board}</PreviewFrame>;
  return board;
}

function PreviewFrame({ children }: { children: ReactNode }) {
  const frame = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const node = frame.current;
    if (!node) return;
    const apply = () => setScale(node.clientWidth / CARD_W);
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={frame} className="relative w-full overflow-hidden" style={{ aspectRatio: "2 / 3" }}>
      <div
        className="absolute top-0 left-0"
        style={{ width: CARD_W, height: CARD_H, transform: `scale(${scale})`, transformOrigin: "top left" }}
      >
        {children}
      </div>
    </div>
  );
}

function CoverBoard({ event, layout, themeId, variant }: InviteCoverProps) {
  const pad: CSSProperties =
    variant === "page"
      ? {
          paddingLeft: "var(--gutter)",
          paddingRight: "var(--gutter)",
          paddingTop: "max(1.25rem, env(safe-area-inset-top))",
          paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))",
        }
      : { padding: 18 };
  const frame =
    variant === "page"
      ? "mx-auto flex min-h-dvh w-full max-w-[430px] flex-col"
      : variant === "card"
        ? "mx-auto flex w-full max-w-[380px] shrink-0 flex-col overflow-hidden"
        : "flex h-full w-full flex-col";
  const cardSize: CSSProperties =
    variant === "card"
      ? { width: "min(100%, 380px, calc((100dvh - 14rem) * 0.72))", aspectRatio: "0.72" }
      : {};
  return (
    <section
      className={frame}
      style={{
        ...pad,
        ...cardSize,
        background: `var(--event-theme-${themeId})`,
        color: `var(--event-theme-${themeId}-ink)`,
        fontFamily: "var(--font-sans)",
      }}
    >
      {layout === "grid" ? <GridCover event={event} /> : null}
      {layout === "corners" ? <CornersCover event={event} /> : null}
      {layout === "oversized" ? (
        <OversizedCover event={event} bleed={variant === "page" ? "calc(14px - var(--gutter))" : "-4px"} />
      ) : null}
    </section>
  );
}

function GridCover({ event }: { event: InviteCoverEvent }) {
  const place = placeLine(event);
  const about = aboutLine(event);
  const when = formatEventWhen(event.date);
  const rows = [
    when ? { label: "Date", value: when } : null,
    place ? { label: "Place", value: place } : null,
  ].filter((row): row is { label: string; value: string } => Boolean(row));

  return (
    <div className="flex flex-col">
      {event.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={event.logoUrl} alt="" className="mb-4 size-8 object-contain" />
      ) : null}
      <p className="t-label mb-4">Invitation</p>
      <GridTitle name={event.name} />
      {about ? (
        <p
          className="mt-4 mb-0 line-clamp-6"
          style={{ fontSize: 14, lineHeight: 1.5, opacity: 0.82, overflowWrap: "break-word", whiteSpace: "pre-wrap" }}
        >
          {about}
        </p>
      ) : null}
      {rows.length > 0 ? (
        <div className="mt-6" style={{ borderTop: `1px solid ${HAIRLINE}` }}>
          {rows.map((row) => (
            <div
              key={row.label}
              className="grid items-baseline py-2"
              style={{ gridTemplateColumns: "62px minmax(0, 1fr)", columnGap: 14, borderBottom: `1px solid ${HAIRLINE}` }}
            >
              <span className="t-label">{row.label}</span>
              <span style={{ fontSize: 14, fontWeight: 400, letterSpacing: "-0.015em" }}>
                {row.value}
              </span>
            </div>
          ))}
        </div>
      ) : null}
      <div className="mt-8 flex items-end justify-end">
        <AdedWordmark color="currentColor" className="block h-auto w-10" />
      </div>
    </div>
  );
}

function GridTitle({ name }: { name: string }) {
  const ref = useRef<HTMLHeadingElement>(null);
  const [size, setSize] = useState(44);
  const [ready, setReady] = useState(false);

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    node.style.fontSize = "44px";
    const lines = node.scrollHeight / (44 * 0.95);
    setSize(lines >= 2.6 ? 32 : 44);
    setReady(true);
  }, [name]);

  return (
    <h1
      ref={ref}
      className="m-0 line-clamp-3"
      style={{
        visibility: ready ? "visible" : "hidden",
        fontWeight: 700,
        fontSize: size,
        lineHeight: 0.95,
        letterSpacing: "-0.035em",
      }}
    >
      {name}
    </h1>
  );
}

function CornersCover({ event }: { event: InviteCoverEvent }) {
  const place = placeLine(event);
  const about = aboutLine(event);
  const time = eventClock(event.date);

  const date = dottedDate(event.date);

  return (
    <div className="relative min-h-0 flex-1">
      <Corner x="left" y="top" />
      <Corner x="right" y="top" />
      <Corner x="left" y="bottom" />
      <Corner x="right" y="bottom" />
      <div className="flex h-full flex-col items-center px-8 pt-10">
        <p className="m-0 uppercase" style={{ fontSize: 9.5, fontWeight: 400, letterSpacing: "0.3em" }}>
          ADED · {romanYear(eventYear(event.date))}
        </p>
        <div className="mt-8 w-full">
          <LightTitle name={event.name} />
        </div>
        {about ? (
          <p
            className="mt-4 mb-0 line-clamp-6 text-center"
            style={{
              width: "100%",
              maxWidth: 250,
              fontSize: 12.5,
              fontWeight: 300,
              lineHeight: 1.65,
              overflowWrap: "break-word",
              whiteSpace: "pre-wrap",
            }}
          >
            {about}
          </p>
        ) : null}
        {date ? (
          <p className="mt-4 mb-0" style={{ fontSize: 12, fontWeight: 300, letterSpacing: "0.32em" }}>
            {date}
          </p>
        ) : null}
      </div>
      {place || time ? (
        <p className="absolute right-8 bottom-8 left-8 mb-0" style={{ fontSize: 12, fontWeight: 300, lineHeight: 1.6 }}>
          {place}
          {place && time ? <br /> : null}
          {time}
        </p>
      ) : null}
    </div>
  );
}

function Corner({ x, y }: { x: "left" | "right"; y: "top" | "bottom" }) {
  return (
    <span
      aria-hidden
      className="absolute h-4 w-4"
      style={{
        [x]: 16,
        [y]: 16,
        borderTop: y === "top" ? "0.5px solid currentColor" : undefined,
        borderBottom: y === "bottom" ? "0.5px solid currentColor" : undefined,
        borderLeft: x === "left" ? "0.5px solid currentColor" : undefined,
        borderRight: x === "right" ? "0.5px solid currentColor" : undefined,
      }}
    />
  );
}

function LightTitle({ name }: { name: string }) {
  const ref = useRef<HTMLHeadingElement>(null);
  const [size, setSize] = useState(44);
  const [ready, setReady] = useState(false);

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    let low = 16;
    let high = 44;
    let best = 16;
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      node.style.fontSize = `${mid}px`;
      const lines = node.scrollHeight / (mid * 1.05);
      if (lines <= 2.15) {
        best = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }
    setSize(best);
    setReady(true);
  }, [name]);

  return (
    <h1
      ref={ref}
      className="m-0 text-center"
      style={{
        visibility: ready ? "visible" : "hidden",
        fontWeight: 200,
        fontSize: size,
        lineHeight: 1.05,
        letterSpacing: "-0.02em",
      }}
    >
      {name}
    </h1>
  );
}

function OversizedCover({
  event,
  bleed,
}: {
  event: InviteCoverEvent;
  /** Side margin that pulls the title out to 14px from the cover edge. */
  bleed: string;
}) {
  const place = placeLine(event);
  const about = aboutLine(event);
  const when = fashionWhen(event.date);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-start justify-between gap-3">
        <p className="t-label mb-0">ADED · {eventYear(event.date)}</p>
        {when ? <p className="t-label mb-0 text-right">{when}</p> : null}
      </div>
      <OversizedTitle name={event.name} bleed={bleed} />
      {about ? (
        <div style={{ borderTop: "1.4px solid currentColor" }}>
          <p
            className="mt-2 mb-3 line-clamp-6"
            style={{ fontSize: 12, lineHeight: 1.5, overflowWrap: "break-word", whiteSpace: "pre-wrap" }}
          >
            {about}
          </p>
        </div>
      ) : null}
      {place ? <p className="mb-0" style={{ fontSize: 12, fontWeight: 400 }}>{place}</p> : null}
    </div>
  );
}

const FASHION_TYPE: CSSProperties = {
  fontWeight: 700,
  lineHeight: 0.86,
  letterSpacing: "-0.05em",
  textTransform: "uppercase",
};

function OversizedTitle({ name, bleed }: { name: string; bleed: string }) {
  const zone = useRef<HTMLDivElement>(null);
  const probe = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState<FittedTitle | null>(null);

  useLayoutEffect(() => {
    const box = zone.current;
    const meter = probe.current;
    if (!box || !meter) return;
    let stopped = false;
    const run = () => {
      if (stopped) return;
      const width = box.clientWidth;
      const height = box.clientHeight;
      if (width <= 0 || height <= 0) return;
      const next = fitTitle(name, width, height, (lines, fontSize) => {
        meter.style.fontSize = `${fontSize}px`;
        meter.replaceChildren();
        for (const line of lines) {
          const row = document.createElement("div");
          row.style.whiteSpace = "nowrap";
          row.textContent = line;
          meter.appendChild(row);
        }
        return { width: meter.scrollWidth, height: meter.scrollHeight };
      });
      setFit(next);
    };
    run();
    const observer = new ResizeObserver(run);
    observer.observe(box);
    void document.fonts?.ready.then(() => {
      if (!stopped) run();
    });
    return () => {
      stopped = true;
      observer.disconnect();
    };
  }, [name]);

  /* The zone is absolute so its height is the space the flex column gives it, also when the page only has a min height. */
  return (
    <div className="relative my-4 min-h-0 flex-1" style={{ marginLeft: bleed, marginRight: bleed }}>
      <div ref={zone} className="absolute inset-0">
        <div ref={probe} aria-hidden className="pointer-events-none absolute top-0 left-0" style={{ ...FASHION_TYPE, visibility: "hidden" }} />
        <div
          className="flex h-full flex-col justify-center"
          style={{ ...FASHION_TYPE, visibility: fit ? "visible" : "hidden", fontSize: fit?.fontSize ?? 10 }}
        >
          {(fit?.lines ?? [name]).map((line, index) => (
            <div key={`${index}-${line}`} className="whitespace-nowrap">
              {line}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

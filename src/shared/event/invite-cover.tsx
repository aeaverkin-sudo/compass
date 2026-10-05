"use client";

import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { EventLayoutId, EventThemeId } from "@/shared/event/themes";
import { dottedDate, eventClock, eventDayLong, eventDaySlash, eventTimeRange } from "@/shared/event/when";

const DESIGN_W = 286;
const DESIGN_H = 404;
const MODERN_PAPER = "#f6f5f0";
const HAIR = "color-mix(in srgb, currentColor 26%, transparent)";
const MONO_FACE = "var(--font-mono, inherit)";
const MONO: CSSProperties = { fontFamily: "var(--font-mono, var(--font-sans))" };

export type InviteCoverEvent = {
  name: string;
  description: string | null;
  date: string | null;
  endDate: string | null;
  place: string | null;
  placeSecret: boolean;
  logoUrl: string | null;
};

type InviteCoverProps = {
  event: InviteCoverEvent;
  layout: EventLayoutId;
  themeId: EventThemeId;
  variant: "page" | "preview" | "card" | "square";
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

function modernAccent(themeId: EventThemeId): string {
  if (themeId === "orange") return "#E8640C";
  if (themeId === "blue") return "#1f3bd6";
  return "#111111";
}

function modernTitleSize(name: string): number {
  const length = name.trim().length;
  if (length <= 11) return 62;
  if (length <= 22) return 44;
  return 32;
}

function coverPaint(layout: EventLayoutId, themeId: EventThemeId) {
  const modern = layout === "oversized";
  return {
    background: modern ? MODERN_PAPER : `var(--event-theme-${themeId})`,
    color: modern ? modernAccent(themeId) : `var(--event-theme-${themeId}-ink)`,
  };
}

function clamp(lines: number): CSSProperties {
  return {
    display: "-webkit-box",
    WebkitLineClamp: lines,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
  };
}

function mask(image: string): CSSProperties {
  return { WebkitMaskImage: image, maskImage: image };
}

export function InviteCover({ event, layout, themeId, variant }: InviteCoverProps) {
  const paint = coverPaint(layout, themeId);
  return (
    <div className={variant === "page" ? "min-h-dvh" : undefined} style={variant === "page" ? paint : undefined}>
      <Scaler variant={variant}>
        <Cover event={event} layout={layout} themeId={themeId} />
      </Scaler>
    </div>
  );
}

function Scaler({ variant, children }: { variant: InviteCoverProps["variant"]; children: ReactNode }) {
  const frame = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(variant === "page" ? 1 : 0.001);

  useLayoutEffect(() => {
    const node = frame.current;
    if (!node) return;
    const apply = () => setScale(node.clientWidth / DESIGN_W);
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div className={variant === "page" ? "relative mx-auto w-full max-w-[430px]" : "w-full"}>
      <div ref={frame} className="relative w-full overflow-hidden" style={{ aspectRatio: `${DESIGN_W} / ${DESIGN_H}` }}>
        <div
          className="absolute top-0 left-0"
          style={{ width: DESIGN_W, height: DESIGN_H, transform: `scale(${scale})`, transformOrigin: "top left" }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

function Cover({
  event,
  layout,
  themeId,
}: {
  event: InviteCoverEvent;
  layout: EventLayoutId;
  themeId: EventThemeId;
}) {
  const paint = coverPaint(layout, themeId);
  return (
    <div
      style={{
        width: DESIGN_W,
        height: DESIGN_H,
        position: "relative",
        overflow: "hidden",
        fontFamily: "var(--font-sans)",
        ...paint,
      }}
    >
      {layout === "grid" ? <EditorialCover event={event} /> : null}
      {layout === "corners" ? <FashionCover event={event} /> : null}
      {layout === "oversized" ? <ModernCover event={event} /> : null}
    </div>
  );
}

function editorialTitleSize(name: string): number {
  const length = name.trim().length;
  if (length <= 14) return 38;
  if (length <= 26) return 30;
  return 24;
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontFamily: MONO_FACE, fontSize: 7, letterSpacing: "0.16em", textTransform: "uppercase", opacity: 0.55, marginBottom: 2 }}>
        {label}
      </div>
      <div style={{ fontSize: 10.5, lineHeight: 1.35 }}>{value}</div>
    </div>
  );
}

function EditorialCover({ event }: { event: InviteCoverEvent }) {
  const date = eventDayLong(event.date);
  const time = eventTimeRange(event.date, event.endDate);
  const place = placeLine(event);
  const about = event.description?.trim() || null;
  const fields = (
    <>
      {date ? <Field label="Date" value={date} /> : null}
      {time ? <Field label="Time" value={time} /> : null}
      {place ? <Field label="Place" value={place} /> : null}
    </>
  );

  return (
    <div style={{ position: "relative", height: "100%", boxSizing: "border-box" }}>
      <div style={{ position: "absolute", inset: 14, border: `0.6px solid ${HAIR}`, pointerEvents: "none" }} />
      <div
        style={{
          position: "relative",
          height: "100%",
          padding: "21px 22px",
          display: "flex",
          flexDirection: "column",
          boxSizing: "border-box",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <span style={{ fontFamily: MONO_FACE, fontSize: 8, letterSpacing: "0.24em", fontWeight: 700 }}>ADED</span>
          <span style={{ fontFamily: MONO_FACE, fontSize: 7, letterSpacing: "0.18em", opacity: 0.5, textTransform: "uppercase" }}>
            Invitation
          </span>
        </div>
        <div style={{ height: 0.6, background: HAIR, marginTop: 9 }} />
        <h1
          className="m-0 line-clamp-3"
          style={{ marginTop: 13, fontWeight: 800, fontSize: editorialTitleSize(event.name), lineHeight: 0.86, letterSpacing: "-0.03em" }}
        >
          {event.name}
        </h1>
        <div style={{ height: 1.4, background: "currentColor", marginTop: 13 }} />
        <div style={{ display: "grid", gridTemplateColumns: about ? "96px 1fr" : "1fr", flex: 1, minHeight: 0, marginTop: 13 }}>
          <div style={{ paddingRight: about ? 14 : 0 }}>
            {event.logoUrl ? (
              <div style={{ width: "100%", aspectRatio: "1.08", border: "0.8px solid currentColor", overflow: "hidden", marginBottom: 12 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={event.logoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              </div>
            ) : null}
            {about ? (
              fields
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>{fields}</div>
            )}
          </div>
          {about ? (
            <div style={{ borderLeft: `0.6px solid ${HAIR}`, paddingLeft: 14 }}>
              <div style={{ fontFamily: MONO_FACE, fontSize: 7, letterSpacing: "0.16em", textTransform: "uppercase", opacity: 0.55, marginBottom: 6 }}>
                About
              </div>
              <div
                className="line-clamp-[10]"
                style={{ fontSize: 9.5, lineHeight: 1.6, textAlign: "justify", overflowWrap: "break-word", whiteSpace: "pre-wrap" }}
              >
                {about}
              </div>
            </div>
          ) : null}
        </div>
        <div style={{ height: 0.6, background: HAIR, marginTop: 4 }} />
        <div style={{ fontFamily: MONO_FACE, fontSize: 6.5, letterSpacing: "0.2em", textTransform: "uppercase", opacity: 0.5, marginTop: 6 }}>
          ADED
        </div>
      </div>
    </div>
  );
}

function Corner({ x, y }: { x: "left" | "right"; y: "top" | "bottom" }) {
  const edge = "0.7px solid currentColor";
  return (
    <span
      aria-hidden
      style={{
        position: "absolute",
        width: 13,
        height: 13,
        [x]: 16,
        [y]: 16,
        borderTop: y === "top" ? edge : undefined,
        borderBottom: y === "bottom" ? edge : undefined,
        borderLeft: x === "left" ? edge : undefined,
        borderRight: x === "right" ? edge : undefined,
      }}
    />
  );
}

function FashionCover({ event }: { event: InviteCoverEvent }) {
  const about = aboutLine(event);
  const date = dottedDate(event.date);
  const place = placeLine(event);
  const time = eventClock(event.date);
  const foot = place && time ? `${place} · ${time}` : place || time;
  const hair: CSSProperties = { width: 34, height: 1, background: "currentColor", opacity: 0.5, margin: "16px 0" };

  return (
    <div
      style={{
        boxSizing: "border-box",
        display: "flex",
        height: "100%",
        flexDirection: "column",
        alignItems: "center",
        padding: 30,
        textAlign: "center",
      }}
    >
      <Corner x="left" y="top" />
      <Corner x="right" y="top" />
      <Corner x="left" y="bottom" />
      <Corner x="right" y="bottom" />
      {event.logoUrl ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={event.logoUrl}
            alt=""
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: 86,
              height: 92,
              objectFit: "cover",
              ...mask("linear-gradient(126deg, #000 34%, rgba(0,0,0,.5) 62%, transparent 90%)"),
            }}
          />
          <div
            aria-hidden
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: 120,
              height: 128,
              background:
                "repeating-linear-gradient(0deg, color-mix(in srgb, currentColor 30%, transparent) 0 1px, transparent 1px 5px)",
              ...mask("linear-gradient(126deg, transparent 40%, rgba(0,0,0,.6) 60%, transparent 92%)"),
            }}
          />
        </>
      ) : null}
      <div
        style={{
          marginTop: 62,
          fontSize: 7.5,
          letterSpacing: "0.42em",
          textTransform: "uppercase",
          opacity: 0.85,
        }}
      >
        ADED
      </div>
      <div style={hair} />
      <div
        style={{
          fontWeight: 400,
          fontSize: 17,
          lineHeight: 1.6,
          letterSpacing: "0.3em",
          textTransform: "uppercase",
          ...clamp(3),
        }}
      >
        {event.name.toUpperCase()}
      </div>
      <div style={hair} />
      {date ? <div style={{ fontSize: 10, letterSpacing: "0.3em", ...MONO }}>{date}</div> : null}
      {about ? (
        <div style={{ maxWidth: "78%", marginTop: 18, fontSize: 8.5, lineHeight: 1.9, opacity: 0.82, ...clamp(4) }}>
          {about}
        </div>
      ) : null}
      {foot ? (
        <div
          style={{
            marginTop: "auto",
            fontSize: 7.5,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            opacity: 0.75,
          }}
        >
          {foot}
        </div>
      ) : null}
    </div>
  );
}

function ModernCover({ event }: { event: InviteCoverEvent }) {
  const day = eventDaySlash(event.date);
  const time = eventTimeRange(event.date, event.endDate);
  const place = placeLine(event);
  const about = aboutLine(event);

  return (
    <>
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "repeating-linear-gradient(0deg, color-mix(in srgb, currentColor 14%, transparent) 0 1px, transparent 1px 40px), repeating-linear-gradient(90deg, color-mix(in srgb, currentColor 14%, transparent) 0 1px, transparent 1px 40px)",
        }}
      />
      {event.logoUrl ? <ModernPic url={event.logoUrl} /> : null}
      <div
        style={{
          position: "absolute",
          top: 18,
          right: 20,
          textAlign: "right",
          fontSize: 7.5,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          ...MONO,
        }}
      >
        ADED
      </div>
      {day ? (
        <div style={{ position: "absolute", top: 128, left: 18 }}>
          <div style={{ fontSize: 7, letterSpacing: "0.18em", textTransform: "uppercase", opacity: 0.7, ...MONO }}>Date</div>
          <div style={{ fontSize: 22, ...MONO }}>{day}</div>
        </div>
      ) : null}
      {time ? (
        <div style={{ position: "absolute", top: 176, left: 18 }}>
          <div style={{ fontSize: 7, letterSpacing: "0.18em", textTransform: "uppercase", opacity: 0.7, ...MONO }}>Time</div>
          <div style={{ fontSize: 11, ...MONO }}>{time}</div>
        </div>
      ) : null}
      {about ? (
        <div style={{ position: "absolute", top: 128, right: 16, maxWidth: 130, padding: "9px 10px" }}>
          <span
            aria-hidden
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: 9,
              height: 9,
              borderTop: "1px solid currentColor",
              borderLeft: "1px solid currentColor",
            }}
          />
          <span
            aria-hidden
            style={{
              position: "absolute",
              right: 0,
              bottom: 0,
              width: 9,
              height: 9,
              borderRight: "1px solid currentColor",
              borderBottom: "1px solid currentColor",
            }}
          />
          <p style={{ margin: 0, fontSize: 8, lineHeight: 1.7, ...MONO, ...clamp(5) }}>{about}</p>
        </div>
      ) : null}
      <div
        style={{
          position: "absolute",
          right: -4,
          bottom: 48,
          left: -4,
          fontWeight: 700,
          fontSize: modernTitleSize(event.name),
          lineHeight: 0.8,
          letterSpacing: "-0.055em",
          textTransform: "uppercase",
          textAlign: "center",
        }}
      >
        {event.name.toUpperCase()}
      </div>
      {place ? (
        <div style={{ position: "absolute", bottom: 16, left: 18 }}>
          <div style={{ fontSize: 7, letterSpacing: "0.18em", textTransform: "uppercase", opacity: 0.7, ...MONO }}>Place</div>
          <div style={{ fontSize: 9, ...MONO }}>{place}</div>
        </div>
      ) : null}
    </>
  );
}

function ModernPic({ url }: { url: string }) {
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt=""
        style={{
          position: "absolute",
          top: 8,
          left: 6,
          width: 92,
          height: 98,
          objectFit: "cover",
          ...mask("linear-gradient(130deg, #000 50%, transparent 94%)"),
        }}
      />
      <div
        aria-hidden
        style={{
          position: "absolute",
          top: 8,
          left: 6,
          width: 124,
          height: 130,
          opacity: 0.6,
          backgroundImage: "radial-gradient(circle, currentColor 1.1px, transparent 1.7px)",
          backgroundSize: "8px 8px",
          ...mask("linear-gradient(130deg, transparent 46%, #000 68%, transparent 94%)"),
        }}
      />
    </>
  );
}

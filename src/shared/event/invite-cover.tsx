"use client";

import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { modernAccent, type EventLayoutId, type EventThemeId } from "@/shared/event/themes";
import { dottedDate, eventClock, eventDayLong, eventDaySlash, eventTimeRange } from "@/shared/event/when";
import { CardInvite } from "@/shared/event/card-invite";
import { eventTitleLine } from "@/shared/event/event-title";
import { posterFields, type InviteLogoLook, type InviteRow, type PosterField } from "@/shared/event/invite-rows";

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
  /** The event's own zone. */
  timeZone?: string | null;
  place: string | null;
  placeSecret: boolean;
  logoUrl: string | null;
  price?: string | null;
  inviteRows?: InviteRow[] | null;
  logoLook?: InviteLogoLook | null;
};

type InviteCoverProps = {
  event: InviteCoverEvent;
  layout: EventLayoutId;
  themeId: EventThemeId;
  variant: "page" | "preview" | "card" | "square" | "full";
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

/** Layout top of a node inside the cover, before the scale: offsets ignore transforms. */
function topIn(node: HTMLElement, root: HTMLElement): number {
  let top = 0;
  let current: HTMLElement | null = node;
  while (current && current !== root) {
    top += current.offsetTop;
    current = current.offsetParent as HTMLElement | null;
  }
  return top;
}

/**
 * Where own fields must end: above `[data-fit-floor]` by its number (6 by default),
 * or, for `foot`, above a bottom line of that height.
 */
function fitFloor(root: HTMLElement): number {
  const mark = root.querySelector<HTMLElement>("[data-fit-floor]");
  if (!mark) return root.offsetHeight - 30;
  if (mark.dataset.fitFloor === "foot") return root.offsetHeight - 30 - mark.offsetHeight - 6;
  return topIn(mark, root) - (Number(mark.dataset.fitFloor) || 6);
}

const FIT_MIN = 0.6;
const FIT_STEP = 0.04;

/** About shrinks with the cover's `--fit-about`, own field values with `--fit-field`, down to their floor size. */
function fitSize(px: number, floor: number, part: "about" | "field" = "field"): string {
  return `max(${floor}px, calc(${px}px * var(--fit-${part}, 1)))`;
}

function setLines(node: HTMLElement, lines: number | null) {
  node.style.display = lines ? "-webkit-box" : "";
  node.style.webkitLineClamp = lines ? String(lines) : "";
  node.style.webkitBoxOrient = lines ? "vertical" : "";
  node.style.overflow = lines ? "hidden" : "";
}

/**
 * The small cover keeps its text above the floor. About `[data-fit-about]` gets smaller until it fits,
 * then loses a line at a time. Own fields `[data-fit]` get smaller until they fit, then the last ones hide.
 * The title, date, place and price never shrink. The full poster shows everything as it is.
 */
function useFitCover(full: boolean, key: string) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const root = ref.current;
    if (full || !root) return;
    const fit = () => {
      const fields = [...root.querySelectorAll<HTMLElement>("[data-fit]")];
      const about = root.querySelector<HTMLElement>("[data-fit-about]");
      for (const field of fields) field.style.display = "";
      if (about) setLines(about, null);
      root.style.setProperty("--fit-about", "1");
      root.style.setProperty("--fit-field", "1");
      const floor = fitFloor(root);
      const above = (node: HTMLElement) => node.offsetParent === null || topIn(node, root) + node.offsetHeight <= floor;
      const aboutFits = () => !about || above(about);
      const fieldsFit = () => fields.every(above);
      const shrink = (part: "about" | "field", fits: () => boolean) => {
        for (let scale = 1; !fits() && scale > FIT_MIN; ) {
          scale = Math.max(FIT_MIN, scale - FIT_STEP);
          root.style.setProperty(`--fit-${part}`, String(scale));
        }
      };
      shrink("about", aboutFits);
      if (about && !aboutFits()) {
        const line = parseFloat(getComputedStyle(about).lineHeight) || 10;
        for (let lines = Math.round(about.offsetHeight / line); !aboutFits() && lines > 2; ) {
          lines -= 1;
          setLines(about, lines);
        }
      }
      shrink("field", fieldsFit);
      for (let index = fields.length - 1; index >= 0 && !fieldsFit(); index -= 1) fields[index]!.style.display = "none";
    };
    fit();
    void document.fonts?.ready.then(fit);
  }, [full, key]);
  return ref;
}

export function InviteCover({ event, layout, themeId, variant }: InviteCoverProps) {
  const paint = coverPaint(layout, themeId);
  return (
    <div className={variant === "page" ? "min-h-dvh" : undefined} style={variant === "page" ? paint : undefined}>
      <Scaler variant={variant}>
        <Cover event={event} layout={layout} themeId={themeId} full={variant === "full"} />
      </Scaler>
    </div>
  );
}

/** Sets the scale from the server HTML before the first paint, so the cover does not wait for hydration. */
const SCALE_NOW = `(function(s){var f=s&&s.previousElementSibling;if(f&&f.clientWidth)f.style.setProperty("--cover-scale",String(f.clientWidth/${DESIGN_W}))})(document.currentScript)`;

function Scaler({ variant, children }: { variant: InviteCoverProps["variant"]; children: ReactNode }) {
  const frame = useRef<HTMLDivElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const full = variant === "full";
  const [fullHeight, setFullHeight] = useState(DESIGN_H);
  const transform = `scale(var(--cover-scale, ${variant === "page" ? 1 : 0.001}))`;

  useLayoutEffect(() => {
    const node = frame.current;
    const sheetNode = sheet.current;
    if (!node) return;
    const apply = () => {
      const next = node.clientWidth / DESIGN_W || 0.001;
      node.style.setProperty("--cover-scale", String(next));
      if (full && sheetNode) setFullHeight(Math.max(DESIGN_H * next, sheetNode.scrollHeight * next));
    };
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(node);
    if (sheetNode) observer.observe(sheetNode);
    return () => observer.disconnect();
  }, [full]);

  if (variant === "page") {
    return (
      <div className="relative mx-auto w-full max-w-[430px]">
        <div
          ref={frame}
          suppressHydrationWarning
          className="relative w-full overflow-hidden"
          style={{ aspectRatio: `${DESIGN_W} / ${DESIGN_H}` }}
        >
          <div className="absolute top-0 left-0" style={{ width: DESIGN_W, height: DESIGN_H, transform, transformOrigin: "top left" }}>
            {children}
          </div>
        </div>
        <script dangerouslySetInnerHTML={{ __html: SCALE_NOW }} />
      </div>
    );
  }

  return (
    <div className="w-full">
      <div
        ref={frame}
        suppressHydrationWarning
        className="relative w-full overflow-hidden"
        style={full ? { height: fullHeight } : { aspectRatio: `${DESIGN_W} / ${DESIGN_H}` }}
      >
        <div
          ref={sheet}
          className="absolute top-0 left-0"
          style={{
            width: DESIGN_W,
            height: full ? "auto" : DESIGN_H,
            transform,
            transformOrigin: "top left",
          }}
        >
          {children}
        </div>
      </div>
      <script dangerouslySetInnerHTML={{ __html: SCALE_NOW }} />
    </div>
  );
}

function Cover({
  event,
  layout,
  themeId,
  full,
}: {
  event: InviteCoverEvent;
  layout: EventLayoutId;
  themeId: EventThemeId;
  full: boolean;
}) {
  const paint = coverPaint(layout, themeId);
  const poster = layout === "card" ? event : { ...event, name: eventTitleLine(event.name) };
  const fitRef = useFitCover(
    full || layout === "card",
    JSON.stringify([layout, poster.name, poster.description, poster.date, poster.place, poster.price, poster.logoUrl, poster.inviteRows]),
  );
  return (
    <div
      ref={fitRef}
      data-cover-root
      style={{
        width: DESIGN_W,
        height: full ? "auto" : DESIGN_H,
        minHeight: full ? DESIGN_H : undefined,
        position: "relative",
        overflow: full ? "visible" : "hidden",
        fontFamily: "var(--font-sans)",
        ...paint,
      }}
    >
      {layout === "card" ? <CardInvite event={event} themeId={themeId} /> : null}
      {layout === "grid" ? <EditorialCover event={poster} full={full} /> : null}
      {layout === "corners" ? <FashionCover event={poster} full={full} /> : null}
      {layout === "oversized" ? <ModernCover event={poster} full={full} /> : null}
    </div>
  );
}

function editorialTitleSize(name: string): number {
  const length = name.trim().length;
  if (length <= 14) return 38;
  if (length <= 26) return 30;
  return 24;
}

function Field({ label, value, fit = false }: { label: string; value: string; fit?: boolean }) {
  return (
    <div style={{ marginBottom: 10 }} data-fit={fit || undefined}>
      <div style={{ fontFamily: MONO_FACE, fontSize: 7, letterSpacing: "0.16em", textTransform: "uppercase", opacity: 0.55, marginBottom: 2 }}>
        {label}
      </div>
      <div style={{ fontSize: fit ? fitSize(10.5, 7) : 10.5, lineHeight: 1.35, overflowWrap: "break-word" }}>{value}</div>
    </div>
  );
}

function EditorialCover({ event, full }: { event: InviteCoverEvent; full: boolean }) {
  const date = eventDayLong(event.date, event.timeZone);
  const time = eventTimeRange(event.date, event.endDate, event.timeZone);
  const place = placeLine(event);
  const about = event.description?.trim() || null;
  const extras = posterFields(event.inviteRows);
  const fields = (
    <>
      {date ? <Field label="Date" value={date} /> : null}
      {time ? <Field label="Time" value={time} /> : null}
      {place ? <Field label="Place" value={place} /> : null}
      {event.price ? <Field label="Price" value={event.price} /> : null}
      {extras.map((field) => (
        <Field key={field.id} label={field.label} value={field.value} fit />
      ))}
    </>
  );

  return (
    <div style={{ position: "relative", height: full ? "auto" : "100%", minHeight: full ? DESIGN_H : undefined, boxSizing: "border-box" }}>
      <div style={{ position: "absolute", inset: 14, border: `0.6px solid ${HAIR}`, pointerEvents: "none" }} />
      <div
        style={{
          position: "relative",
          height: full ? "auto" : "100%",
          minHeight: full ? DESIGN_H : undefined,
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
          className={full ? "m-0" : "m-0 line-clamp-3"}
          style={{
            marginTop: 13,
            fontWeight: 800,
            fontSize: editorialTitleSize(event.name),
            lineHeight: full ? 0.95 : 0.86,
            letterSpacing: "-0.03em",
            overflowWrap: "break-word",
          }}
        >
          {event.name}
        </h1>
        <div style={{ height: 1.4, background: "currentColor", marginTop: 13 }} />
        <div
          style={{
            display: "grid",
            gridTemplateColumns: about ? "96px 1fr" : "1fr",
            marginTop: 13,
            ...(full ? {} : { flex: 1, minHeight: 0 }),
          }}
        >
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
                data-fit-about={full ? undefined : true}
                style={{
                  fontSize: full ? 9.5 : fitSize(9.5, 6, "about"),
                  lineHeight: 1.6,
                  textAlign: "justify",
                  overflowWrap: "break-word",
                  whiteSpace: "pre-wrap",
                }}
              >
                {about}
              </div>
            </div>
          ) : null}
        </div>
        <div data-fit-floor style={{ height: 0.6, background: HAIR, marginTop: 4 }} />
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

function FashionCover({ event, full }: { event: InviteCoverEvent; full: boolean }) {
  const about = aboutLine(event);
  const date = dottedDate(event.date, event.timeZone);
  const place = placeLine(event);
  const time = eventClock(event.date, event.timeZone);
  const footBits = [place, time, event.price?.trim() || null].filter((bit): bit is string => Boolean(bit));
  const foot = footBits.length > 0 ? footBits.join(" · ") : null;
  const extras = posterFields(event.inviteRows);
  const hair: CSSProperties = { width: 34, height: 1, background: "currentColor", opacity: 0.5, margin: "16px 0" };

  return (
    <div
      style={{
        boxSizing: "border-box",
        display: "flex",
        height: full ? "auto" : "100%",
        minHeight: full ? DESIGN_H : undefined,
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
          overflowWrap: "break-word",
          flexShrink: 0,
          ...(full ? {} : clamp(3)),
        }}
      >
        {event.name.toUpperCase()}
      </div>
      <div style={hair} />
      {date ? <div style={{ fontSize: 10, letterSpacing: "0.3em", ...MONO }}>{date}</div> : null}
      {about ? (
        <div
          data-fit-about={full ? undefined : true}
          style={{
            maxWidth: "78%",
            marginTop: 18,
            fontSize: full ? 8.5 : fitSize(8.5, 6, "about"),
            lineHeight: 1.9,
            opacity: 0.82,
            overflowWrap: "break-word",
            whiteSpace: "pre-wrap",
            flexShrink: 0,
          }}
        >
          {about}
        </div>
      ) : null}
      {extras.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: "78%", marginTop: 16, flexShrink: 0 }}>
          {extras.map((field) => (
            <div key={field.id} data-fit style={{ overflowWrap: "break-word", ...MONO }}>
              {field.label ? (
                <div style={{ fontSize: 6.5, letterSpacing: "0.3em", textTransform: "uppercase", opacity: 0.6 }}>{field.label}</div>
              ) : null}
              <div style={{ fontSize: full ? 8.5 : fitSize(8.5, 7), letterSpacing: "0.08em", ...(full ? { whiteSpace: "pre-wrap" } : clamp(4)) }}>
                {field.value}
              </div>
            </div>
          ))}
        </div>
      ) : null}
      {foot ? (
        <div
          data-fit-floor="foot"
          style={{
            marginTop: "auto",
            fontSize: 7.5,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            opacity: 0.75,
            overflowWrap: "break-word",
            ...(full ? { whiteSpace: "pre-wrap" } : {}),
          }}
        >
          {foot}
        </div>
      ) : null}
    </div>
  );
}

/** Date, Time and the own fields: one stack on the preview and the full poster. */
function ModernFields({
  day,
  time,
  extras,
  full,
}: {
  day: string | null;
  time: string | null;
  extras: PosterField[];
  full: boolean;
}) {
  const caption: CSSProperties = { fontSize: 7, letterSpacing: "0.18em", textTransform: "uppercase", opacity: 0.7, ...MONO };
  return (
    <>
      {day ? (
        <div>
          <div style={caption}>Date</div>
          <div style={{ fontSize: 22, ...MONO }}>{day}</div>
        </div>
      ) : null}
      {time ? (
        <div style={{ marginTop: day ? 12 : 0 }}>
          <div style={caption}>Time</div>
          <div style={{ fontSize: 11, ...MONO }}>{time}</div>
        </div>
      ) : null}
      {extras.map((field, index) => (
        <div key={field.id} data-fit style={{ marginTop: day || time || index > 0 ? 10 : 0 }}>
          {field.label ? <div style={caption}>{field.label}</div> : null}
          <div
            style={{ fontSize: full ? 9 : fitSize(9, 7), overflowWrap: "break-word", ...MONO, ...(full ? { whiteSpace: "pre-wrap" } : clamp(4)) }}
          >
            {field.value}
          </div>
        </div>
      ))}
    </>
  );
}

function ModernCover({ event, full }: { event: InviteCoverEvent; full: boolean }) {
  return full ? <ModernFull event={event} /> : <ModernSmall event={event} />;
}

function ModernSmall({ event }: { event: InviteCoverEvent }) {
  const day = eventDaySlash(event.date, event.timeZone);
  const time = eventTimeRange(event.date, event.endDate, event.timeZone);
  const place = placeLine(event);
  const about = aboutLine(event);
  const extras = posterFields(event.inviteRows);

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
      {day || time || extras.length > 0 ? (
        <div style={{ position: "absolute", top: 128, left: 18, maxWidth: about ? 114 : 250 }}>
          <ModernFields day={day} time={time} extras={extras} full={false} />
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
          <p data-fit-about style={{ margin: 0, fontSize: fitSize(8, 6, "about"), lineHeight: 1.7, ...MONO }}>
            {about}
          </p>
        </div>
      ) : null}
      {/* Line height 0.8: the letters rise above the box. */}
      <div
        data-fit-floor={Math.round(modernTitleSize(event.name) * 0.2) + 8}
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
      {event.price ? (
        <div style={{ position: "absolute", bottom: 16, right: 18, textAlign: "right" }}>
          <div style={{ fontSize: 7, letterSpacing: "0.18em", textTransform: "uppercase", opacity: 0.7, ...MONO }}>Price</div>
          <div style={{ fontSize: 9, ...MONO }}>{event.price}</div>
        </div>
      ) : null}
    </>
  );
}

function ModernFull({ event }: { event: InviteCoverEvent }) {
  const day = eventDaySlash(event.date, event.timeZone);
  const time = eventTimeRange(event.date, event.endDate, event.timeZone);
  const place = placeLine(event);
  const about = aboutLine(event);
  const extras = posterFields(event.inviteRows);

  return (
    <div style={{ position: "relative", minHeight: DESIGN_H, boxSizing: "border-box", padding: "18px 18px 20px" }}>
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "repeating-linear-gradient(0deg, color-mix(in srgb, currentColor 14%, transparent) 0 1px, transparent 1px 40px), repeating-linear-gradient(90deg, color-mix(in srgb, currentColor 14%, transparent) 0 1px, transparent 1px 40px)",
        }}
      />
      <div style={{ position: "relative" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          {event.logoUrl ? (
            <div style={{ position: "relative", width: 92, height: 98, flex: "0 0 auto" }}>
              <ModernPic url={event.logoUrl} top={0} left={0} />
            </div>
          ) : (
            <span />
          )}
          <div style={{ textAlign: "right", fontSize: 7.5, letterSpacing: "0.14em", textTransform: "uppercase", ...MONO }}>ADED</div>
        </div>
        {/* Positioned after the halftone, so the dots stay under the text as on the preview. */}
        <div style={{ position: "relative" }}>
          {day || time || extras.length > 0 ? (
            <div style={{ marginTop: 16 }}>
              <ModernFields day={day} time={time} extras={extras} full />
            </div>
          ) : null}
          {about ? (
            <p style={{ margin: "16px 0 0", fontSize: 8, lineHeight: 1.7, overflowWrap: "break-word", whiteSpace: "pre-wrap", ...MONO }}>{about}</p>
          ) : null}
          <div
            style={{
              marginTop: 18,
              fontWeight: 700,
              fontSize: modernTitleSize(event.name),
              lineHeight: 0.9,
              letterSpacing: "-0.055em",
              textTransform: "uppercase",
              textAlign: "center",
              overflowWrap: "break-word",
            }}
          >
            {event.name.toUpperCase()}
          </div>
          {place || event.price ? (
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginTop: 16 }}>
              {place ? (
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 7, letterSpacing: "0.18em", textTransform: "uppercase", opacity: 0.7, ...MONO }}>Place</div>
                  <div style={{ fontSize: 9, overflowWrap: "break-word", ...MONO }}>{place}</div>
                </div>
              ) : (
                <span />
              )}
              {event.price ? (
                <div style={{ textAlign: "right", flex: "0 0 auto" }}>
                  <div style={{ fontSize: 7, letterSpacing: "0.18em", textTransform: "uppercase", opacity: 0.7, ...MONO }}>Price</div>
                  <div style={{ fontSize: 9, ...MONO }}>{event.price}</div>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** The logo and its halftone. One piece for the preview and the full poster, so they match. */
function ModernPic({ url, top = 8, left = 6 }: { url: string; top?: number; left?: number }) {
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt=""
        style={{
          position: "absolute",
          top,
          left,
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
          top,
          left,
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

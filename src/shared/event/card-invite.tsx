"use client";

import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { HeroName } from "@/shared/components/hero-name";
import { SectionNumber, ValueCap, sectionNumberLabel } from "@/shared/components/section-number";
import { photoSlotLookClass } from "@/shared/lib/photo-look";
import { customInviteRows, inviteLabel, type InviteLogoLook, type InviteRow } from "@/shared/event/invite-rows";
import { eventThemeById, type EventThemeId } from "@/shared/event/themes";
import { sameEvening } from "@/shared/event/when";
import { EVENT_TITLE_LINES } from "@/shared/event/event-title";
import { CARD_HEADER_PAD_PX, HEADER_FADE_PX, HERO_PHOTO_PX, SECTION_PAD_PX } from "@main/layout";

const SHEET_W = 286;
const SHEET_H = 404;
/** The card is laid out at phone width, then scaled into the sheet. */
export const CARD_INVITE_W = 375;
/** The widest layout before values get an ellipsis: everything at half the card size. */
const CARD_INVITE_MAX_W = 750;
/** The card column at phone width: 28 + clamp(24px, 6.1vw, 28px) − 3mm. */
const GUTTER_PX = 28 + 24 - (3 * 96) / 25.4;
const DARK_TOKENS = {
  "--ink": "#ffffff",
  "--grey": "rgba(255,255,255,0.6)",
  "--rule": "rgba(255,255,255,0.6)",
  "--placeholder": "rgba(255,255,255,0.45)",
} as CSSProperties;

export type CardInviteEvent = {
  name: string;
  description: string | null;
  logoUrl: string | null;
  logoLook?: InviteLogoLook | null;
  inviteRows?: InviteRow[] | null;
  place: string | null;
  placeSecret: boolean;
  date: string | null;
  endDate: string | null;
  /** The form preview: empty When, Place and About show their placeholders. */
  hints?: boolean;
};

type Line = { id: string; label: string; value: string; hint: boolean };

function parsed(iso: string | null): Date | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function clock(date: Date) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** "12.10.26" */
function dateValue(iso: string | null): string {
  const date = parsed(iso);
  if (!date) return "";
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${String(date.getFullYear()).slice(2)}`;
}

/** "15:30–20:30". Midnight start with no end is a date only. */
function timeValue(startIso: string | null, endIso: string | null): string {
  const start = parsed(startIso);
  if (!start) return "";
  const end = parsed(endIso);
  const sameDay = end && (end.toDateString() === start.toDateString() || sameEvening(start, end));
  const endClock = end && sameDay ? clock(end) : "";
  const startClock = clock(start);
  if (startClock === "00:00" && !endClock) return "";
  return endClock ? `${startClock}–${endClock}` : startClock;
}

function inviteLines(event: CardInviteEvent): Line[] {
  const rows = event.inviteRows;
  const when = [dateValue(event.date), timeValue(event.date, event.endDate)].filter(Boolean).join(" · ");
  const place = event.placeSecret ? "Revealed closer to the date" : (event.place?.trim() ?? "");
  const base: Line[] = [
    { id: "when", label: inviteLabel(rows, "when"), value: when, hint: false },
    { id: "place", label: inviteLabel(rows, "place"), value: place, hint: false },
    { id: "about", label: inviteLabel(rows, "about"), value: event.description?.trim() ?? "", hint: false },
  ];
  const hints: Record<string, string> = { when: "12.10.26 · 15:30–20:30", place: "Venue, address", about: "About the event" };
  const lines = base.flatMap((line) =>
    line.value ? [line] : event.hints ? [{ ...line, value: hints[line.id]!, hint: true }] : [],
  );
  for (const row of customInviteRows(rows)) {
    const value = row.value?.trim() ?? "";
    if (value) lines.push({ id: row.id, label: row.title.trim(), value, hint: false });
    else if (event.hints && row.title.trim()) lines.push({ id: row.id, label: row.title.trim(), value: "description", hint: true });
  }
  return lines;
}

function clampValue(node: HTMLElement, lines: number | null) {
  node.style.display = lines ? "-webkit-box" : "";
  node.style.webkitLineClamp = lines ? String(lines) : "";
  node.style.webkitBoxOrient = lines ? "vertical" : "";
  node.style.overflow = lines ? "hidden" : "";
}

/**
 * The narrowest layout width whose scaled height fits the sheet, between the card width and twice that.
 * Past that the tallest values lose a line at a time until the sheet holds them.
 */
function fitSheet(node: HTMLElement): number {
  const values = Array.from(node.querySelectorAll<HTMLElement>("[data-invite-value]"));
  values.forEach((value) => clampValue(value, null));
  const fits = (width: number) => {
    node.style.width = `${width}px`;
    return node.offsetHeight * (SHEET_W / width) <= SHEET_H + 0.5;
  };
  let width = CARD_INVITE_W;
  if (!fits(CARD_INVITE_W)) {
    if (fits(CARD_INVITE_MAX_W)) {
      let lo = CARD_INVITE_W;
      let hi = CARD_INVITE_MAX_W;
      while (hi - lo > 2) {
        const mid = (lo + hi) / 2;
        if (fits(mid)) hi = mid;
        else lo = mid;
      }
      width = hi;
    } else {
      width = CARD_INVITE_MAX_W;
      const lineOf = (value: HTMLElement) => parseFloat(getComputedStyle(value).lineHeight) || 22.5;
      const linesOf = (value: HTMLElement) => Math.round(value.offsetHeight / lineOf(value));
      for (let step = 0; step < 200 && !fits(width); step += 1) {
        const tallest = values.reduce<HTMLElement | null>(
          (best, value) => (linesOf(value) > 1 && (!best || linesOf(value) > linesOf(best)) ? value : best),
          null,
        );
        if (!tallest) break;
        clampValue(tallest, linesOf(tallest) - 1);
      }
    }
  }
  node.style.width = `${width}px`;
  node.style.transform = `scale(${SHEET_W / width})`;
  return width;
}

/** The guest's ADED card on one sheet: logo and name, then the filled rows numbered in order. */
export function CardInvite({ event, themeId }: { event: CardInviteEvent; themeId: EventThemeId }) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const [fonts, setFonts] = useState(0);
  const theme = eventThemeById(themeId);
  const lines = inviteLines(event);
  const named = event.name.trim().length > 0;

  useLayoutEffect(() => {
    if (sheetRef.current) fitSheet(sheetRef.current);
  });

  useLayoutEffect(() => {
    let live = true;
    void document.fonts?.ready.then(() => {
      if (live) setFonts((count) => count + 1);
    });
    return () => {
      live = false;
    };
  }, []);

  return (
    <div
      data-fonts={fonts}
      className="relative overflow-hidden text-[var(--ink)]"
      style={{ width: SHEET_W, height: SHEET_H, background: theme.ground, ...(theme.dark ? DARK_TOKENS : {}) }}
    >
      <div
        ref={sheetRef}
        className="absolute top-0 left-0"
        style={{
          width: CARD_INVITE_W,
          transform: `scale(${SHEET_W / CARD_INVITE_W})`,
          paddingInline: GUTTER_PX,
          paddingTop: GUTTER_PX,
          paddingBottom: lines.length > 0 ? GUTTER_PX - SECTION_PAD_PX : GUTTER_PX,
          transformOrigin: "top left",
        }}
      >
        <div
          className="flex shrink-0 items-stretch gap-3"
          style={{ height: HERO_PHOTO_PX, marginBottom: CARD_HEADER_PAD_PX + HEADER_FADE_PX - SECTION_PAD_PX }}
        >
          {event.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={event.logoUrl}
              alt=""
              className={cn("size-[128px] shrink-0 object-cover", photoSlotLookClass(event.logoLook ?? undefined))}
            />
          ) : null}
          <div className="relative flex h-full min-w-0 flex-1 flex-col">
            {named || event.hints ? <HeroName value={event.name} placeholder="Event title" maxLines={EVENT_TITLE_LINES} align="center" /> : null}
          </div>
        </div>
        {lines.length > 0 ? (
          <div className="border-t border-[var(--rule)]">
            {lines.map((line, index) => (
              <section
                key={line.id}
                className={cn("min-w-0 py-[18px]", index < lines.length - 1 && "border-b border-[var(--rule)]")}
              >
                <div className="grid grid-cols-[86px_minmax(0,1fr)] items-start gap-x-[14px]">
                  <div className={cn("min-w-0", line.hint && "[&_[data-section-number]]:!text-[var(--placeholder)]")}>
                    <SectionNumber value={sectionNumberLabel(index)} />
                    <span className="t-label mt-[6px] block min-w-0 whitespace-normal line-clamp-3">{line.label}</span>
                  </div>
                  <ValueCap className="min-w-0">
                    <p
                      data-invite-value=""
                      className={cn("m-0 t-body whitespace-pre-line break-words", line.hint && "text-[var(--placeholder)]")}
                    >
                      {line.value}
                    </p>
                  </ValueCap>
                </div>
              </section>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

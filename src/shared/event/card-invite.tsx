"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { HeroName } from "@/shared/components/hero-name";
import { SectionNumber, ValueCap } from "@/shared/components/section-number";
import { photoSlotLookClass } from "@/shared/lib/photo-look";
import { defaultInviteRows, inviteRowNumbers, type InviteLogoLook, type InviteRow } from "@/shared/event/invite-rows";
import { sameEvening } from "@/shared/event/when";
import { CARD_HEADER_PAD_PX, HEADER_FADE_PX, HERO_PHOTO_PX, SECTION_PAD_PX } from "@main/layout";

/** The card is laid out at phone width, then scaled into the sheet. */
export const CARD_INVITE_W = 375;
/** The card column at that width: 28 + clamp(24px, 6.1vw, 28px) − 3mm. */
const GUTTER_PX = 28 + 24 - (3 * 96) / 25.4;

export type CardInviteEvent = {
  name: string;
  logoUrl: string | null;
  logoLook?: InviteLogoLook | null;
  inviteRows?: InviteRow[] | null;
  place: string | null;
  placeSecret: boolean;
  date: string | null;
  endDate: string | null;
};

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

function rowValue(row: InviteRow, event: CardInviteEvent): string {
  if (row.kind === "place") return event.placeSecret ? "Revealed closer to the date" : (event.place?.trim() ?? "");
  if (row.kind === "date") return dateValue(event.date);
  if (row.kind === "time") return timeValue(event.date, event.endDate);
  return row.value?.trim() ?? "";
}

/** The guest's ADED card: logo and name, then the filled rows numbered in order. */
export function CardInvite({ event, height }: { event: CardInviteEvent; height: number | null }) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const scale = 286 / CARD_INVITE_W;
  const [contentHeight, setContentHeight] = useState(0);
  const rows = (event.inviteRows?.length ? event.inviteRows : defaultInviteRows())
    .map((row) => ({ row, value: rowValue(row, event) }))
    .filter((entry) => entry.value.length > 0);
  const numbers = inviteRowNumbers(
    rows.map((entry) => entry.row),
    () => true,
  );

  useLayoutEffect(() => {
    const node = sheetRef.current;
    if (!node || height != null) return;
    const apply = () => setContentHeight(node.offsetHeight);
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(node);
    return () => observer.disconnect();
  }, [height]);

  return (
    <div
      className="relative overflow-hidden bg-white"
      style={{ width: 286, height: height ?? contentHeight * scale }}
    >
      <div
        ref={sheetRef}
        className="absolute top-0 left-0 bg-white text-[var(--ink)]"
        style={{
          width: CARD_INVITE_W,
          minHeight: height != null ? height / scale : undefined,
          paddingInline: GUTTER_PX,
          paddingTop: GUTTER_PX,
          paddingBottom: rows.length > 0 ? GUTTER_PX - SECTION_PAD_PX : GUTTER_PX,
          transform: `scale(${scale})`,
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
            {event.name.trim() ? <HeroName value={event.name} placeholder="Event name" maxLines={3} /> : null}
          </div>
        </div>
        {rows.length > 0 ? (
          <div className="border-t border-[var(--rule)]">
            {rows.map(({ row, value }, index) => (
              <section
                key={row.id || index}
                className={cn("min-w-0 py-[18px]", index < rows.length - 1 && "border-b border-[var(--rule)]")}
              >
                <div className="grid grid-cols-[86px_minmax(0,1fr)] items-start gap-x-[14px]">
                  <div className="min-w-0">
                    <SectionNumber value={numbers[index] ?? ""} />
                    <span className="t-label mt-[6px] block min-w-0 whitespace-normal line-clamp-3">{row.title}</span>
                  </div>
                  <ValueCap className="min-w-0">
                    <p className="m-0 t-body whitespace-pre-line break-words">{value}</p>
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

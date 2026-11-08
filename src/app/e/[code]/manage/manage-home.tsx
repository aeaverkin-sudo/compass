"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Copy } from "lucide-react";
import { SkyToast } from "@/shared/components/sky-toast";
import { Rule } from "@/shared/components/rule";
import { CoverButton } from "@/shared/event/cover-button";
import type { EventLayoutId, EventThemeId } from "@/shared/event/themes";
import { VALUE_AXIS_PX } from "@/shared/layout/axes";
import type { InviteLogoLook, InviteRow } from "@/shared/event/invite-rows";
import { eventTitleLine } from "@/shared/event/event-title";
import { ManageFrame } from "./manage-frame";
import { ENTRY, Room } from "./room";

const SCANNER =
  "press mt-4 block w-full border-0 bg-sky px-[21.6px] py-[10.8px] text-center t-caps text-[var(--ink)] no-underline [-webkit-tap-highlight-color:transparent]";

type Flash = "created" | "saved" | null;

export type HomeRooms = {
  /** Event day: `Today · 19:00 · place`. */
  event: string | null;
  payment: { isPaid: boolean; price: string | null; confirmed: number; pending: number } | null;
  guests: { sent: number; confirmed: number } | null;
  /** Same open link the Guests screen copies. Null when Guests itself is hidden. */
  openLink: { open: boolean; url: string; capacity: number | null; joined: number } | null;
  staff: { id: string; name: string; role: string }[] | null;
  /** Set once the event is over. */
  stats: { after: { came: number; total: number } | null } | null;
};

export function ManageHome({
  lookup,
  name,
  canEdit,
  flash,
  cover,
  scanner,
  rooms,
}: {
  lookup: string;
  name: string;
  canEdit: boolean;
  flash: Flash;
  cover: {
    description: string | null;
    date: string | null;
    endsAt: string | null;
    timeZone: string;
    place: string | null;
    placeSecret: boolean;
    theme: EventThemeId;
    layout: EventLayoutId;
    inviteRows: InviteRow[] | null;
    logoLook: InviteLogoLook | null;
    logoUrl: string | null;
    price: string | null;
  };
  /** With check-in, on the event day (always for the door). */
  scanner: boolean;
  rooms: HomeRooms;
}) {
  const router = useRouter();
  const flashed = useRef(false);
  const [notice, setNotice] = useState<string | null>(flash === "saved" ? "Saved" : null);
  const href = (path: string) => `/e/${encodeURIComponent(lookup)}${path}`;
  const door = !canEdit && !rooms.payment && !rooms.guests && !rooms.staff && !rooms.stats;

  useEffect(() => {
    if (!flash || flashed.current) return;
    flashed.current = true;
    const url = new URL(window.location.href);
    url.searchParams.delete("created");
    url.searchParams.delete("saved");
    const next = `${url.pathname}${url.search}`;
    window.history.replaceState(null, "", next);
  }, [flash]);

  const poster = {
    name,
    description: cover.description,
    date: cover.date,
    endDate: cover.endsAt,
    timeZone: cover.timeZone,
    place: cover.place,
    placeSecret: cover.placeSecret,
    logoUrl: cover.logoUrl,
    price: cover.price,
    inviteRows: cover.inviteRows,
    logoLook: cover.logoLook,
  };

  const list: { key: string; label: string; entry: string; path: string; state: ReactNode }[] = [];
  if (rooms.guests && rooms.openLink) {
    const link = rooms.openLink;
    list.push({
      key: "open",
      label: "Open link",
      entry: "Open link",
      path: "/manage/guests",
      state: link.open ? (
        <OpenLinkValue url={link.url} capacity={link.capacity} joined={link.joined} onNotice={setNotice} />
      ) : (
        "Off"
      ),
    });
  }
  if (rooms.event !== null && canEdit) {
    list.push({ key: "event", label: "Event", entry: "Edit details", path: "/manage/edit", state: rooms.event });
  }
  if (rooms.payment) {
    const { isPaid, price, confirmed, pending } = rooms.payment;
    list.push({
      key: "payment",
      label: "Payment",
      entry: "Edit payments",
      path: "/manage/payment",
      state: isPaid ? [price, `${confirmed} confirmed`, `${pending} pending`].filter(Boolean).join(" · ") : "Free",
    });
  }
  if (rooms.guests) {
    list.push({
      key: "guests",
      label: "Guests",
      entry: "Edit guests",
      path: "/manage/guests",
      state: `${rooms.guests.sent} sent · ${rooms.guests.confirmed} confirmed`,
    });
  }
  if (rooms.staff) {
    list.push({
      key: "staff",
      label: "Staff",
      entry: "Edit staff",
      path: "/manage/staff",
      state:
        rooms.staff.length > 0 ? (
          <ul className="flex flex-col gap-1">
            {rooms.staff.map((person) => (
              <li key={person.id} className="truncate">{`${person.name} · ${person.role}`}</li>
            ))}
          </ul>
        ) : null,
    });
  }
  if (rooms.stats) {
    const after = rooms.stats.after;
    list.push({
      key: "stats",
      label: "Statistics",
      entry: after ? "Statistics" : "After the event",
      path: "/manage/stats",
      state: after ? `${after.came} came of ${after.total}` : null,
    });
  }

  return (
    <ManageFrame title={eventTitleLine(name)} fallbackHref="/network/event" onBack={() => router.replace("/network/event")}>
      {notice ? <SkyToast key={notice} text={notice} onDone={() => setNotice(null)} /> : null}
      <div className="pt-[18px]" style={{ marginLeft: VALUE_AXIS_PX }}>
        <CoverButton event={poster} layout={cover.layout} themeId={cover.theme} variant="card" />
        {scanner ? (
          <Link href={href("/manage/checkin")} className={SCANNER}>
            Open scanner
          </Link>
        ) : null}
        {door && scanner ? (
          <p className="mt-3 mb-0 t-meta text-[var(--grey)]">
            Scan the pass — green, they&apos;re in. Not on the list — find by name inside, or check manually.
          </p>
        ) : null}
        {canEdit && rooms.event === null ? (
          <Link href={href("/manage/edit")} className={`mt-3 ${ENTRY}`}>
            Edit details
          </Link>
        ) : null}
      </div>
      {list.length > 0 ? (
        <>
          <Rule className="mt-[18px]" />
          {list.map((room, index) => (
            <Room
              key={room.key}
              index={index}
              label={room.label}
              entry={room.entry}
              href={href(room.path)}
              testMode={room.key !== "open"}
            >
              {room.state}
            </Room>
          ))}
        </>
      ) : null}
    </ManageFrame>
  );
}

/** The link and the capacity line. The switch stays on the Guests screen. */
function OpenLinkValue({
  url,
  capacity,
  joined,
  onNotice,
}: {
  url: string;
  capacity: number | null;
  joined: number;
  onNotice: (text: string) => void;
}) {
  const copy = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("no clipboard");
      await navigator.clipboard.writeText(url);
      onNotice("Link copied");
    } catch {
      onNotice("Could not copy");
    }
  };
  const line = capacity ? `Capacity ${capacity} · ${joined} joined` : `Capacity · no limit · ${joined} joined`;
  return (
    <>
      <button
        type="button"
        onClick={() => void copy()}
        className="press flex w-full items-baseline justify-between gap-2 border-0 bg-transparent p-0 text-left text-inherit [-webkit-tap-highlight-color:transparent]"
      >
        <span className="min-w-0 break-all">{url.replace(/^https?:\/\//, "")}</span>
        <Copy aria-label="Copy" className="shrink-0 self-center text-[var(--ink)]" size={16} strokeWidth={1.25} />
      </button>
      <p className="mb-0 mt-3 t-meta text-[var(--grey)]">{line}</p>
    </>
  );
}

"use client";

import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ScanLine } from "lucide-react";
import { SkyToast } from "@/shared/components/sky-toast";
import { Rule } from "@/shared/components/rule";
import { Zone } from "@/shared/components/zone";
import { CoverButton } from "@/shared/event/cover-button";
import type { EventPay, PaymentTally } from "@/shared/event/payment-label";
import type { EventLayoutId, EventThemeId } from "@/shared/event/themes";
import { VALUE_AXIS_PX } from "@/shared/layout/axes";
import type { EventManager, ManageSection } from "@/shared/services/event-manage";
import type { GuestPass, NamePair } from "@/shared/event/guest-book";
import type { GuestSource } from "@/shared/event/guest-sources";
import { ManageFrame } from "./manage-frame";
import { GuestsZone } from "./guests-zone";
import { OpenLinkZone } from "./open-link-zone";
import { AfterZone } from "./after-zone";
import { EditZone } from "./edit-zone";
import { PaymentScreen } from "./payment/payment-screen";
import { TeamZone } from "./team-zone";
import type { InviteLogoLook, InviteRow } from "@/shared/event/invite-rows";
import { eventTitleLine } from "@/shared/event/event-title";

const ROW =
  "press inline-flex items-center gap-2 t-body text-[var(--ink)] no-underline [-webkit-tap-highlight-color:transparent]";

type Flash = "created" | "saved" | null;

export function ManageHome({
  lookup,
  name,
  shareUrl,
  sections,
  canEdit,
  canDelete,
  flash,
  cover,
  pay,
  tally,
  managers,
  canRemove,
  teamFull,
  endedLabel,
  doorOpen,
  showGoing,
  openLink,
  guests,
  after,
}: {
  lookup: string;
  name: string;
  shareUrl: string;
  sections: ManageSection[];
  canEdit: boolean;
  canDelete: boolean;
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
  pay: EventPay | null;
  tally: PaymentTally | null;
  managers: EventManager[];
  canRemove: boolean;
  teamFull: boolean;
  /** Set once the event is over: After goes on top, Open link, Team and Door go. */
  endedLabel: string | null;
  /** From two hours before the start to the end, the scanner sits under the poster. */
  doorOpen: boolean;
  /** Guests see who's going under the poster. */
  showGoing: boolean;
  openLink: { open: boolean; capacity: number | null; joined: number };
  guests: {
    counter: string;
    checkedIn: number;
    sources: GuestSource[];
    pairs: NamePair[];
    passes: GuestPass[];
    sent: { sent: number; opened: number; going: number };
  };
  after: { came: number; total: number; cards: number; paid: { paid: number; pending: number } | null } | null;
}) {
  const router = useRouter();
  const flashed = useRef(false);
  const [notice, setNotice] = useState<string | null>(flash === "saved" ? "Saved" : null);
  const ended = endedLabel !== null;
  const shown = (section: ManageSection) => sections.includes(section);
  const href = (path: string) => `/e/${encodeURIComponent(lookup)}${path}`;

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

  const zones: { key: string; node: ReactNode }[] = [];
  if (ended && after && (shown("analytics") || shown("guests"))) {
    zones.push({
      key: "after",
      node: (
        <AfterZone
          lookup={lookup}
          endedLabel={endedLabel}
          came={after.came}
          total={after.total}
          cards={after.cards}
          paid={after.paid}
          canExportGuests={shown("guests")}
          canExportReport={shown("analytics")}
        />
      ),
    });
  }
  if (shown("payment") && pay && tally) {
    zones.push({ key: "payment", node: <PaymentScreen lookup={lookup} pay={pay} tally={tally} /> });
  }
  if (shown("guests") && !ended) {
    zones.push({
      key: "open-link",
      node: (
        <OpenLinkZone
          lookup={lookup}
          open={openLink.open}
          capacity={openLink.capacity}
          joined={openLink.joined}
          shareUrl={shareUrl}
          onNotice={setNotice}
        />
      ),
    });
  }
  if (shown("guests")) {
    zones.push({
      key: "guests",
      node: (
        <GuestsZone
          lookup={lookup}
          guestsHref={href("/manage/guests")}
          addHref={href("/manage/guests/add")}
          counter={guests.counter}
          sources={guests.sources}
          pairs={guests.pairs}
          passes={guests.passes}
          inviteUrl={shareUrl}
          sent={guests.sent}
          showGoing={showGoing}
          compact={ended}
          onNotice={setNotice}
        />
      ),
    });
  }
  if (shown("managers") && !ended) {
    zones.push({
      key: "team",
      node: (
        <TeamZone lookup={lookup} eventName={name} managers={managers} canRemove={canRemove} full={teamFull} onNotice={setNotice} />
      ),
    });
  }
  if (shown("checkin") && !ended) {
    zones.push({
      key: "door",
      node: (
        <Zone label="Door">
          <Link href={href("/manage/checkin")} className={ROW}>
            <ScanLine size={16} strokeWidth={1.25} className="shrink-0 text-[var(--ink)]" />
            Open scanner
          </Link>
        </Zone>
      ),
    });
  }
  if (canEdit) {
    zones.push({
      key: "edit",
      node: <EditZone lookup={lookup} deleteName={eventTitleLine(name)} canDelete={canDelete} />,
    });
  }

  return (
    <ManageFrame title={eventTitleLine(name)} fallbackHref="/network/event" onBack={() => router.replace("/network/event")}>
      {notice ? <SkyToast key={notice} text={notice} onDone={() => setNotice(null)} /> : null}
      <div className="pt-[18px]" style={{ marginLeft: VALUE_AXIS_PX }}>
        <CoverButton event={poster} layout={cover.layout} themeId={cover.theme} variant="card" />
        {doorOpen && shown("checkin") && !ended ? (
          <Link href={href("/manage/checkin")} className={`mt-4 ${ROW}`}>
            <ScanLine size={16} strokeWidth={1.25} className="shrink-0 text-[var(--ink)]" />
            {`Open scanner · ${guests.checkedIn} in`}
          </Link>
        ) : null}
      </div>
      <Rule className="mt-[18px]" />
      {zones.map((zone, index) => (
        <Fragment key={zone.key}>
          {index > 0 ? <Rule /> : null}
          {zone.node}
        </Fragment>
      ))}
    </ManageFrame>
  );
}

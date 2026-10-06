"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SkyToast } from "@/shared/components/sky-toast";
import { Rule } from "@/shared/components/rule";
import { Zone } from "@/shared/components/zone";
import { CoverButton } from "@/shared/event/cover-button";
import { shareInviteLink } from "@/shared/event/share-invite";
import type { EventPay, PaymentTally } from "@/shared/event/payment-label";
import type { EventLayoutId, EventThemeId } from "@/shared/event/themes";
import { VALUE_AXIS_PX } from "@/shared/layout/axes";
import type { EventManager, ManageSection } from "@/shared/services/event-manage";
import { ManageFrame } from "./manage-frame";
import { GuestsZone } from "./guests-zone";
import { PaymentScreen } from "./payment/payment-screen";
import { TeamZone } from "./team-zone";

const SKY =
  "press w-full border-0 bg-sky px-[21.6px] py-[10.8px] text-center t-caps text-[var(--ink)] [-webkit-tap-highlight-color:transparent]";

type Flash = "created" | "saved" | null;

export function ManageHome({
  lookup,
  name,
  shareUrl,
  sections,
  canEdit,
  flash,
  cover,
  going,
  confirmed,
  checkedIn,
  isPaid,
  pay,
  tally,
  managers,
  canRemove,
  teamFull,
}: {
  lookup: string;
  name: string;
  shareUrl: string;
  sections: ManageSection[];
  canEdit: boolean;
  flash: Flash;
  cover: {
    description: string | null;
    date: string | null;
    endsAt: string | null;
    place: string | null;
    placeSecret: boolean;
    theme: EventThemeId;
    layout: EventLayoutId;
    logoUrl: string | null;
    price: string | null;
  };
  going: number;
  confirmed: number;
  checkedIn: number;
  isPaid: boolean;
  pay: EventPay | null;
  tally: PaymentTally | null;
  managers: EventManager[];
  canRemove: boolean;
  teamFull: boolean;
}) {
  const router = useRouter();
  const flashed = useRef(false);
  const [notice, setNotice] = useState<string | null>(null);
  const shown = (section: ManageSection) => sections.includes(section);
  const href = (path: string) => `/e/${encodeURIComponent(lookup)}${path}`;

  useEffect(() => {
    if (!flash || flashed.current) return;
    flashed.current = true;
    setNotice(flash === "created" ? "Event created" : "Saved");
    const url = new URL(window.location.href);
    url.searchParams.delete("created");
    url.searchParams.delete("saved");
    const next = `${url.pathname}${url.search}`;
    window.history.replaceState(null, "", next);
  }, [flash]);

  const share = () => {
    const canShare = typeof navigator.share === "function" ? (data: { title: string; url: string }) => navigator.share(data) : undefined;
    void shareInviteLink(
      { title: name, url: shareUrl },
      {
        share: canShare,
        writeText: async (value) => {
          if (!navigator.clipboard?.writeText) throw new Error("no clipboard");
          await navigator.clipboard.writeText(value);
        },
      },
    ).then((outcome) => {
      if (outcome === "copied") setNotice("Link copied");
    });
  };

  const after = (section: ManageSection) => {
    const order: ManageSection[] = ["guests", "payment", "managers", "checkin"];
    const index = order.indexOf(section);
    return order.slice(index + 1).some((item) => shown(item));
  };
  const poster = {
    name,
    description: cover.description,
    date: cover.date,
    endDate: cover.endsAt,
    place: cover.place,
    placeSecret: cover.placeSecret,
    logoUrl: cover.logoUrl,
    price: cover.price,
  };
  const hasZone = shown("guests") || shown("payment") || shown("managers") || shown("checkin");

  return (
    <ManageFrame title={name} fallbackHref="/network/event" onBack={() => router.replace("/network/event")}>
      {notice ? <SkyToast key={notice} text={notice} onDone={() => setNotice(null)} /> : null}
      <div className="pt-[18px]" style={{ marginLeft: VALUE_AXIS_PX }}>
        <CoverButton event={poster} layout={cover.layout} themeId={cover.theme} variant="card" />
        {shown("guests") ? (
          <button type="button" onClick={share} className={`mt-4 ${SKY}`}>
            Invite guests
          </button>
        ) : null}
      </div>
      <Rule className="mt-[18px]" />
      {shown("guests") ? (
        <>
          <GuestsZone
            href={href("/manage/guests")}
            going={going}
            confirmed={confirmed}
            checkedIn={checkedIn}
            isPaid={isPaid}
          />
          {after("guests") ? <Rule /> : null}
        </>
      ) : null}
      {shown("payment") && pay && tally ? (
        <>
          <PaymentScreen lookup={lookup} pay={pay} tally={tally} />
          {after("payment") ? <Rule /> : null}
        </>
      ) : null}
      {shown("managers") ? (
        <>
          <TeamZone
            lookup={lookup}
            eventName={name}
            managers={managers}
            canRemove={canRemove}
            full={teamFull}
            onNotice={setNotice}
          />
          {after("managers") ? <Rule /> : null}
        </>
      ) : null}
      {shown("checkin") ? (
        <Zone label="Check-in">
          <Link
            href={href("/manage/checkin")}
            className="press block t-body text-[var(--ink)] no-underline [-webkit-tap-highlight-color:transparent]"
          >
            Open scanner
          </Link>
        </Zone>
      ) : null}
      {canEdit ? (
        <>
          {hasZone ? <Rule /> : null}
          <Zone label="Edit">
            <Link
              href={href("/manage/edit")}
              className="press block t-body text-[var(--ink)] no-underline [-webkit-tap-highlight-color:transparent]"
            >
              Change details
            </Link>
          </Zone>
        </>
      ) : null}
    </ManageFrame>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { SkyToast } from "@/shared/components/sky-toast";
import { Rule } from "@/shared/components/rule";
import { Zone } from "@/shared/components/zone";
import { InviteCover } from "@/shared/event/invite-cover";
import { shareInviteLink } from "@/shared/event/share-invite";
import type { EventPay, PaymentTally } from "@/shared/event/payment-label";
import type { EventLayoutId, EventThemeId } from "@/shared/event/themes";
import { VALUE_AXIS_PX } from "@/shared/layout/axes";
import type { EventGuest, EventManager, ManageSection } from "@/shared/services/event-manage";
import { ManageFrame } from "./manage-frame";
import { GuestsZone } from "./guests-zone";
import { PaymentScreen } from "./payment/payment-screen";
import { TeamZone } from "./team-zone";

const SKY =
  "press border-0 bg-sky px-[21.6px] py-[10.8px] t-caps text-[var(--ink)] [-webkit-tap-highlight-color:transparent]";

type Flash = "created" | "saved" | null;

export function ManageHome({
  lookup,
  name,
  publicToken,
  shareUrl,
  sections,
  canEdit,
  flash,
  cover,
  guests,
  canMark,
  isPaid,
  pay,
  tally,
  returnUrl,
  managers,
  canRemove,
  teamFull,
}: {
  lookup: string;
  name: string;
  publicToken: string;
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
  guests: EventGuest[];
  canMark: boolean;
  isPaid: boolean;
  pay: EventPay | null;
  tally: PaymentTally | null;
  returnUrl: string;
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

  return (
    <ManageFrame title={name} fallbackHref="/network/event" onBack={() => router.replace("/network/event")}>
      {notice ? <SkyToast key={notice} text={notice} onDone={() => setNotice(null)} /> : null}
      <div className="pt-[18px]">
        <Link
          href={`/e/${encodeURIComponent(publicToken)}`}
          className="block"
          style={{ marginLeft: VALUE_AXIS_PX, width: 150 }}
        >
          <InviteCover
            variant="card"
            layout={cover.layout}
            themeId={cover.theme}
            event={{
              name,
              description: cover.description,
              date: cover.date,
              endDate: cover.endsAt,
              place: cover.place,
              placeSecret: cover.placeSecret,
              logoUrl: cover.logoUrl,
              price: cover.price,
            }}
          />
        </Link>
        {canEdit ? (
          <Link
            href={href("/manage/edit")}
            className="press mt-3 block t-body text-[var(--ink)] no-underline [-webkit-tap-highlight-color:transparent]"
            style={{ marginLeft: VALUE_AXIS_PX }}
          >
            Edit invite
          </Link>
        ) : null}
        <button type="button" onClick={share} className={`mt-4 ${SKY}`} style={{ marginLeft: VALUE_AXIS_PX }}>
          Invite guests
        </button>
        <p className="mt-3 t-meta break-all text-[var(--grey)]" style={{ marginLeft: VALUE_AXIS_PX }}>
          {shareUrl}
        </p>
      </div>
      <Rule className="mt-[18px]" />
      {shown("guests") ? (
        <>
          <GuestsZone lookup={lookup} guests={guests} canMark={canMark} isPaid={isPaid} />
          {after("guests") ? <Rule /> : null}
        </>
      ) : null}
      {shown("payment") && pay && tally ? (
        <>
          <PaymentScreen lookup={lookup} pay={pay} tally={tally} returnUrl={returnUrl} />
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
            className="press flex items-center justify-between gap-3 text-[var(--ink)] no-underline [-webkit-tap-highlight-color:transparent]"
          >
            <span className="t-body">Open scanner</span>
            <ChevronRight className="size-4 shrink-0" strokeWidth={1.5} aria-hidden />
          </Link>
        </Zone>
      ) : null}
    </ManageFrame>
  );
}

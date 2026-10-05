"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { ChevronRight, Share } from "lucide-react";
import { SkyToast } from "@/shared/components/sky-toast";
import { Zone } from "@/shared/components/zone";
import { shareInviteLink } from "@/shared/event/share-invite";
import type { ManageSection } from "@/shared/services/event-manage";
import { ManageFrame } from "./manage-frame";

type ManageHomeProps = {
  lookup: string;
  name: string;
  line: string;
  shareUrl: string;
  sections: ManageSection[];
  guestsValue: string;
  paymentValue: string;
  managersValue: string;
};

function Chevron() {
  return <ChevronRight className="size-4 shrink-0 text-[var(--ink)]" strokeWidth={1.5} aria-hidden />;
}

function Entry({ children }: { children: ReactNode }) {
  return <div className="flex items-center justify-between gap-3">{children}</div>;
}

export function ManageHome({
  lookup,
  name,
  line,
  shareUrl,
  sections,
  guestsValue,
  paymentValue,
  managersValue,
}: ManageHomeProps) {
  const [notice, setNotice] = useState<string | null>(null);
  const href = (path: string) => `/e/${encodeURIComponent(lookup)}${path}`;
  const shown = (section: ManageSection) => sections.includes(section);
  const last = sections[sections.length - 1];

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
      if (outcome === "copied") setNotice("Ссылка скопирована");
    });
  };

  return (
    <ManageFrame title={name} fallbackHref="/network/event">
      {notice ? <SkyToast key={notice} text={notice} onDone={() => setNotice(null)} /> : null}
      {shown("event") ? (
        <Zone label="Event" rule={last !== "event"}>
          <p className="mb-0 t-body text-[var(--ink)]">{line}</p>
        </Zone>
      ) : null}
      {shown("invite") ? (
        <Zone label="Invite" rule={last !== "invite"}>
          <button
            type="button"
            onClick={share}
            aria-label="Share"
            className="press flex w-full items-center justify-between gap-3 border-0 bg-transparent p-0 text-left text-[var(--ink)] [-webkit-tap-highlight-color:transparent]"
          >
            <Share className="size-4" strokeWidth={1.25} aria-hidden />
            <Chevron />
          </button>
        </Zone>
      ) : null}
      {shown("guests") ? (
        <Zone label="Guests" rule={last !== "guests"}>
          <Link
            href={href("/manage/guests")}
            className="press flex items-center justify-between gap-3 text-[var(--ink)] no-underline [-webkit-tap-highlight-color:transparent]"
          >
            <span className="min-w-0 t-body">{guestsValue}</span>
            <Chevron />
          </Link>
        </Zone>
      ) : null}
      {shown("payment") ? (
        <Zone label="Payment" rule={last !== "payment"}>
          <Link
            href={href("/manage/payment")}
            className="press flex items-center justify-between gap-3 text-[var(--ink)] no-underline [-webkit-tap-highlight-color:transparent]"
          >
            <span className="min-w-0 t-body">{paymentValue}</span>
            <Chevron />
          </Link>
        </Zone>
      ) : null}
      {shown("managers") ? (
        <Zone label="Managers" rule={last !== "managers"}>
          <Link
            href={href("/manage/managers")}
            className="press flex items-center justify-between gap-3 text-[var(--ink)] no-underline [-webkit-tap-highlight-color:transparent]"
          >
            <span className="min-w-0 t-body">{managersValue}</span>
            <Chevron />
          </Link>
        </Zone>
      ) : null}
      {shown("checkin") ? (
        <Zone label="Check-in" rule={last !== "checkin"}>
          <Link
            href={href("/manage/checkin")}
            className="press flex items-center justify-between gap-3 text-[var(--ink)] no-underline [-webkit-tap-highlight-color:transparent]"
          >
            <span className="t-body">Scan</span>
            <Chevron />
          </Link>
        </Zone>
      ) : null}
      {shown("analytics") ? (
        <Zone label="Analytics" rule={last !== "analytics"}>
          <Entry>
            <span className="t-body" />
            <Chevron />
          </Entry>
        </Zone>
      ) : null}
      {shown("edit") ? (
        <Zone label="Edit" rule={last !== "edit"}>
          <Entry>
            <span className="t-body" />
            <Chevron />
          </Entry>
        </Zone>
      ) : null}
    </ManageFrame>
  );
}

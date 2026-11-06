"use client";

import { useState } from "react";
import { Scan, Share } from "lucide-react";
import { ScreenHeader } from "@/shared/components/screen-header";
import { MarkPlus, MARK_PX, RAIL_STROKE_PX } from "@/shared/components/mark-plus";
import { HEADER_ROW_PX } from "@/shared/layout/axes";
import { SCREEN_TOP_AXIS_PX, carouselSidePaddingPx } from "@main/layout";

const RAIL_W = `calc(${carouselSidePaddingPx(1, true)}px + clamp(24px, 6.1vw, 28px) - 3mm)`;

const TOC = [
  ["qr", "QR & Wallet"],
  ["toolbar", "Toolbar"],
  ["portfolios", "Portfolios"],
  ["edit", "Edit"],
  ["network", "Network"],
  ["hold", "Hold"],
  ["profile", "Profile"],
  ["data", "Data"],
  ["events", "Events"],
] as const;

const RAIL_LINES = [
  "Share your portfolio link.",
  "Scan a card — they land in your Network.",
  "A selfie or a note for your next scan. They see it once.",
  "Which portfolio, of how many.",
];

type Section = { id: string; title: string; lines: string[] };

const SECTIONS: Section[] = [
  {
    id: "qr",
    title: "QR & Wallet",
    lines: [
      "Show your QR. They scan it with the phone camera — your card opens, no app needed.",
      "On your card they tap Connect and save you.",
      "Add to Wallet — keep your card with its QR in Apple Wallet.",
      "Get PDF — your card as a file.",
    ],
  },
  {
    id: "toolbar",
    title: "Toolbar",
    lines: ["··· above the bar — Flat or Shadow."],
  },
  {
    id: "portfolios",
    title: "Portfolios",
    lines: [
      "Several cards for different roles. Swipe to switch.",
      "Each has its own name, photo, sections, QR and link.",
    ],
  },
  {
    id: "edit",
    title: "Edit",
    lines: [
      "Edit on the bar opens the editor.",
      "Small + in a section — add a row: link, file, text, contact.",
      "Big + — a new section with any name.",
      "Library — everything you add is kept and can be used in other portfolios.",
      "Save when done. Delete removes a portfolio.",
    ],
  },
  {
    id: "network",
    title: "Network",
    lines: [
      "Everyone you scanned or who shared a card with you.",
      "Search by name, role, company. Sort: recent or A–Z.",
      "Shared their card with you — Confirm or Skip.",
      "Open a contact: Delete · Home · Swap — Swap gives them your card.",
      "Notes — the selfie or note they left you.",
      "Orange dot on Network — something new.",
    ],
  },
  {
    id: "hold",
    title: "Hold",
    lines: ["Hold a contact: Delete or Swap.", "Hold a request: Skip or Confirm."],
  },
  {
    id: "profile",
    title: "Profile",
    lines: [
      "BW / C mode — black-and-white or colour.",
      "Event pass — your pass for an event.",
      "Share anonymous analytics — only an anonymous summary.",
      "Cards shared back to you — accept cards in return or not.",
      "Plan and usage.",
    ],
  },
  {
    id: "data",
    title: "Data",
    lines: [
      "Shared — how many times you shared your card.",
      "Opens — how many times it was opened, via QR and in total.",
      "Saved — how many people saved you.",
      "Link opens — which links on your card were opened.",
    ],
  },
  {
    id: "events",
    title: "Events",
    lines: [
      "Create an event and its poster.",
      "Guests — upload a list, paste guests, or an open link with a limit. Send passes, a reminder 24h before. See who opened and confirmed.",
      "Payment — price, how to pay, upload a statement, mark paid.",
      "Staff — up to 5 people with roles.",
      "Check-in — scan passes at the door.",
      "Statistics — registered, confirmed, checked in. Names are kept 90 days, then only numbers.",
    ],
  },
];

function Line({ text }: { text: string }) {
  return (
    <li className="flex gap-2 t-body text-[var(--ink)]">
      <span className="shrink-0 text-[var(--grey)]">—</span>
      <span>{text}</span>
    </li>
  );
}

function ToolbarFigure() {
  const glyph = "flex h-7 items-center justify-center";
  return (
    <div className="grid items-center gap-x-3" style={{ gridTemplateColumns: `${RAIL_W} minmax(0, 1fr)` }}>
      <div
        className="pointer-events-none col-start-1 row-span-4 row-start-1 flex h-full flex-col justify-around bg-sky py-1 text-[var(--ink)]"
        style={{ width: RAIL_W }}
      >
        <span className={glyph}>
          <Share size={MARK_PX} strokeWidth={RAIL_STROKE_PX} aria-hidden />
        </span>
        <span className={glyph}>
          <Scan size={MARK_PX} strokeWidth={RAIL_STROKE_PX} aria-hidden />
        </span>
        <span className={glyph}>
          <MarkPlus />
        </span>
        <span className={`${glyph} t-caps font-light leading-none`}>1/3</span>
      </div>
      {RAIL_LINES.map((text, index) => (
        <div key={text} style={{ gridColumn: 2, gridRow: index + 1 }}>
          <ul>
            <Line text={text} />
          </ul>
        </div>
      ))}
    </div>
  );
}

export default function ManualPage() {
  const [open, setOpen] = useState<string | null>(null);

  const go = (id: string) => {
    setOpen(id);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <main className="compass-main h-dvh overflow-y-auto bg-white px-[var(--gutter)] pb-[max(2.5rem,env(safe-area-inset-bottom))] text-[var(--ink)]">
      <ScreenHeader title="Manual" fallbackHref="/main" center />
      <div className="grid grid-cols-3 gap-1.5">
        {TOC.map(([id, label]) => {
          const on = open === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => go(id)}
              className="flex items-center justify-center border-0 px-1 text-center"
              style={{
                height: 34.2,
                background: on ? "var(--ink)" : "var(--sky)",
                color: on ? "#fff" : "var(--ink)",
                fontSize: 9.45,
                fontWeight: 400,
                letterSpacing: "0.12em",
                lineHeight: 1.1,
                textTransform: "uppercase",
              }}
            >
              {label}
            </button>
          );
        })}
      </div>
      {SECTIONS.map((section, index) => (
        <section
          key={section.id}
          id={section.id}
          className={index === 0 ? "mt-8" : "mt-8 border-t border-[var(--rule)] pt-4"}
          style={{ scrollMarginTop: `calc(env(safe-area-inset-top) + ${SCREEN_TOP_AXIS_PX + HEADER_ROW_PX + 12}px)` }}
        >
          <h2
            className="text-center font-bold text-[var(--ink)]"
            style={{ fontSize: 22, lineHeight: 1.15, letterSpacing: "-0.02em" }}
          >
            {section.title}
          </h2>
          {section.id === "toolbar" ? (
            <div className="mt-4">
              <ToolbarFigure />
            </div>
          ) : null}
          <ul className="mt-3 flex flex-col gap-2">
            {section.lines.map((text) => (
              <Line key={text} text={text} />
            ))}
          </ul>
        </section>
      ))}
    </main>
  );
}

"use client";

import { useRef, useState } from "react";
import { Scan, Share } from "lucide-react";
import { ScreenHeader } from "@/shared/components/screen-header";
import { MarkPlus, MARK_PX, RAIL_STROKE_PX } from "@/shared/components/mark-plus";

const RAIL_W = "var(--gutter)";

const TOC = [
  ["qr", "QR & Wallet"],
  ["toolbar", "Toolbar"],
  ["portfolios", "Portfolios"],
  ["edit", "Edit"],
  ["network", "Network"],
  ["hold", "Tap & hold"],
  ["account", "Account"],
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
      "On your card they tap Connect.",
      "Add to Wallet — keep your card with its QR in Apple Wallet.",
      "PDF file — your card as a file.",
    ],
  },
  {
    id: "toolbar",
    title: "Toolbar",
    lines: [
      "Tap and hold the toolbar to move it — next to the QR or next to your photo — and to change its style: Flat or Shadow.",
    ],
  },
  {
    id: "portfolios",
    title: "Portfolios",
    lines: [
      "Several cards for different roles. Swipe to switch.",
      "Each has its own name, photo, sections, QR and link.",
      "On your first portfolio, pull right and hold for a second to add a new contact.",
    ],
  },
  {
    id: "edit",
    title: "Edit",
    lines: [
      "Edit portfolio, after the last section, opens the editor.",
      "Small + in a section — add a row: link, file, text, contact.",
      "Big + under the portfolio — add a new section with any name.",
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
      "Network, then + — Scan or Voice.",
      "A contact you added: Delete, Edit, and Swap when a swap is available.",
      "A card you received: Home, and Swap or Back on the right, depending on the state.",
      "Shared their card with you — Confirm or Skip.",
      "Notes — the selfie or note they left you.",
      "Orange dot on Network — something new.",
    ],
  },
  {
    id: "hold",
    title: "Tap and hold",
    lines: [
      "Contact you added: Delete, Edit, and Swap when available.",
      "Saved portfolio: Delete or Swap when available.",
      "Incoming request: Skip or Confirm.",
      "Press and hold the toolbar, then drag it next to the QR or your photo. Use the style menu to choose Flat or Shadow.",
      "Press and hold your portfolio photo to change it, remove it, or choose Frame or Shadow.",
    ],
  },
  {
    id: "account",
    title: "Account",
    lines: [
      "BW / C mode — black-and-white or colour.",
      "Cards shared back to you — accept cards in return or not.",
      "Information — how the app works.",
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
          <MarkPlus size={23} />
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

export default function InfoPage() {
  const [open, setOpen] = useState<string>(TOC[0][0]);
  const scrollerRef = useRef<HTMLDivElement>(null);

  const go = (id: string) => {
    setOpen(id);
    const root = scrollerRef.current;
    const target = root?.querySelector<HTMLElement>(`#${id}`);
    const heading = target?.querySelector<HTMLElement>("h2") ?? target;
    if (!root || !heading) return;
    const top = heading.getBoundingClientRect().top - root.getBoundingClientRect().top + root.scrollTop;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    root.scrollTo({ top: Math.max(0, top), behavior: reduce ? "auto" : "smooth" });
  };

  return (
    <main className="compass-main flex h-dvh flex-col overflow-hidden bg-white px-[var(--gutter)] text-[var(--ink)]">
      <ScreenHeader title="User Guide" fallbackHref="/main" />
      <div className="grid shrink-0 grid-cols-3 gap-1.5 pt-[18px]">
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
                background: on ? "var(--sky)" : "#fff",
                color: "var(--ink)",
                boxShadow: on ? "none" : "0 2px 8px rgba(17,17,17,0.16)",
                fontSize: 13,
                whiteSpace: "normal",
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
      <div
        ref={scrollerRef}
        className="min-h-0 flex-1 overflow-y-auto pb-[max(2.5rem,env(safe-area-inset-bottom))]"
      >
        {SECTIONS.map((section, index) => (
          <section
            key={section.id}
            id={section.id}
            className={index === 0 ? "mt-8" : "mt-8 border-t border-[var(--rule)] pt-4"}
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
        <div aria-hidden className="h-[70vh] shrink-0" />
      </div>
    </main>
  );
}

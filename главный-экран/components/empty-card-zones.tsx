"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { SectionNumber, sectionNumberLabel } from "@/shared/components/section-number";
import { RequiredStar } from "@/app/create/entry-zones";

const HEAD = [
  { id: "position", title: "Position", hint: "What you do", star: true },
  { id: "company", title: "Company", hint: "Company. Business name", star: true },
  { id: "contact", title: "Contacts", hint: "Phone, messenger, mail", star: true },
] as const;

const FOLDED = [
  { id: "web", title: "Web", hint: "Website" },
  { id: "social", title: "Social", hint: "Link — Instagram, LinkedIn, etc." },
  { id: "files", title: "Files", hint: "PDF, JPG, etc." },
  { id: "about", title: "About", hint: "A line about you" },
] as const;

/** Owner-only picture of an empty card. Nothing here is required, and nothing is stored until a row is typed in Edit. */
export function EmptyCardZones({ onPick }: { onPick: (zoneId: string) => void }) {
  const [more, setMore] = useState(false);
  const rows = more ? [...HEAD, ...FOLDED] : [...HEAD];
  return (
    <div className="mt-[18px]">
      {rows.map((zone, index) => (
        <section
          key={zone.id}
          className="grid grid-cols-[86px_minmax(0,1fr)] items-start gap-x-[14px] border-b border-[var(--rule)] py-[18px]"
        >
          <div className="min-w-0">
            <SectionNumber value={sectionNumberLabel(index)} />
            <div className="mt-[6px]">
              <span className="t-label block min-w-0 text-left whitespace-normal break-normal text-[var(--grey)]">
                {zone.title}
              </span>
            </div>
          </div>
          <button
            type="button"
            data-card-content
            data-no-swipe
            className="t-body min-h-11 w-full border-0 bg-transparent p-0 text-left text-[var(--placeholder)]"
            onClick={() => onPick(zone.id)}
          >
            {zone.hint}
            {"star" in zone && zone.star ? <RequiredStar /> : null}
          </button>
        </section>
      ))}
      <button
        type="button"
        aria-expanded={more}
        data-no-swipe
        className="grid w-full grid-cols-[86px_minmax(0,1fr)] items-center gap-x-[14px] border-0 bg-transparent p-0 py-[18px] text-left"
        onClick={() => setMore((current) => !current)}
      >
        <span className="t-label">More</span>
        <span className="flex min-w-0 items-center gap-3">
          {more ? <span className="min-w-0 flex-1" /> : (
            <span className="t-body min-w-0 flex-1 text-[var(--placeholder)]">Web, Social, Files, About</span>
          )}
          <ChevronDown
            className={cn("size-4 shrink-0 text-[var(--ink)]", more && "rotate-180")}
            strokeWidth={1.5}
            aria-hidden
          />
        </span>
      </button>
    </div>
  );
}

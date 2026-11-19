import { cn } from "@/lib/utils";
import { SectionNumber, sectionNumberLabel } from "@/shared/components/section-number";

const HEAD = [
  { id: "position", title: "Position", hint: "What you do" },
  { id: "company", title: "Company", hint: "Company. Business name" },
  { id: "contact", title: "Contacts", hint: "Phone, messenger, mail" },
] as const;

/** Owner-only picture of an empty ready card. Hints are not tappable; Edit is the only way in. */
export function EmptyCardZones() {
  return (
    <div className="mt-[18px]">
      {HEAD.map((zone, index) => (
        <section
          key={zone.id}
          className={cn(
            "grid grid-cols-[86px_minmax(0,1fr)] items-start gap-x-[14px] py-[18px]",
            index < HEAD.length - 1 && "border-b border-[var(--rule)]",
          )}
        >
          <div className="min-w-0">
            <SectionNumber value={sectionNumberLabel(index)} />
            <div className="mt-[6px]">
              <span className="t-label block min-w-0 text-left whitespace-normal break-normal text-[var(--grey)]">
                {zone.title}
              </span>
            </div>
          </div>
          <div className="t-body min-h-11 w-full text-left text-[var(--placeholder)]">{zone.hint}</div>
        </section>
      ))}
    </div>
  );
}

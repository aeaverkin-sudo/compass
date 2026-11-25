import { useRef } from "react";
import { cn } from "@/lib/utils";
import { SectionNumber, sectionNumberLabel } from "@/shared/components/section-number";
import { REORDER_SLOP_PX } from "@/shared/lib/reorder-hold";

const HEAD = [
  { id: "position", title: "Position", hint: "What you do" },
  { id: "company", title: "Company", hint: "Company. Business name" },
  { id: "contact", title: "Contacts", hint: "Phone, messenger, mail" },
] as const;

const TAP_WAIT_MS = 250;
const TAP_SPAN_PX = 30;

/** Owner-only picture of an empty ready card. A double tap opens that section. A single tap does nothing. */
export function EmptyCardZones({ onOpenZone }: { onOpenZone?: (zoneId: string) => void }) {
  const down = useRef<{ id: number; x: number; y: number } | null>(null);
  const last = useRef<{ at: number; x: number; y: number } | null>(null);
  return (
    <div className="mt-[18px]">
      {HEAD.map((zone, index) => (
        <section
          key={zone.id}
          className={cn(
            "grid grid-cols-[86px_minmax(0,1fr)] items-start gap-x-[14px] py-[18px]",
            index < HEAD.length - 1 && "border-b border-[var(--rule)]",
          )}
          onPointerDown={
            onOpenZone
              ? (event) => {
                  down.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
                }
              : undefined
          }
          onPointerUp={
            onOpenZone
              ? (event) => {
                  const start = down.current;
                  if (!start || start.id !== event.pointerId) return;
                  if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > REORDER_SLOP_PX) return;
                  const now = Date.now();
                  const prev = last.current;
                  if (prev && now - prev.at <= TAP_WAIT_MS && Math.hypot(event.clientX - prev.x, event.clientY - prev.y) <= TAP_SPAN_PX) {
                    last.current = null;
                    onOpenZone(zone.id);
                    return;
                  }
                  last.current = { at: now, x: event.clientX, y: event.clientY };
                }
              : undefined
          }
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

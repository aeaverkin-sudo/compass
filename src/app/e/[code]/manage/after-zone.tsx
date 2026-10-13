import { Download } from "lucide-react";
import { Zone } from "@/shared/components/zone";

const ROW =
  "press inline-flex items-center gap-2 t-body text-[var(--ink)] no-underline [-webkit-tap-highlight-color:transparent]";
const ICON = { size: 16, strokeWidth: 1.25, className: "shrink-0 text-[var(--ink)]" } as const;

export function AfterZone({
  lookup,
  endedLabel,
  came,
  total,
  cards,
  paid,
  canExportGuests,
  canExportReport,
}: {
  lookup: string;
  endedLabel: string;
  came: number;
  total: number;
  cards: number;
  /** Paid events only. */
  paid: { paid: number; pending: number } | null;
  canExportGuests: boolean;
  canExportReport: boolean;
}) {
  const base = `/api/events/${encodeURIComponent(lookup)}`;
  return (
    <Zone label="After" align="start">
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1 t-body text-[var(--ink)]">
          <span>{`Ended ${endedLabel}`}</span>
          <span>{`${came} came of ${total}`}</span>
          <span>{`${cards} ${cards === 1 ? "card" : "cards"} exchanged`}</span>
          {paid ? <span>{`${paid.paid} paid · ${paid.pending} pending`}</span> : null}
        </div>
        {canExportGuests ? (
          <a href={`${base}/guests/export`} download className={ROW}>
            <Download {...ICON} />
            Export guests
          </a>
        ) : null}
        {canExportReport ? (
          <a href={`${base}/report`} download className={ROW}>
            <Download {...ICON} />
            Export report
          </a>
        ) : null}
        <p className="mb-0 t-meta text-[var(--grey)]">Names and contacts stay for 90 days, then only the numbers.</p>
      </div>
    </Zone>
  );
}

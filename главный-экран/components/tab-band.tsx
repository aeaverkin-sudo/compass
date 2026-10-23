import type { ReactNode } from "react";
import { BAND_ROW_PX } from "../layout";

/**
 * The sky bar on the glass. One row, one height, on every screen that has it.
 * The home indicator is padding under the row, so the sky continues to the glass.
 */
export function BottomBand({
  left,
  right,
  center,
  label,
  inset = "var(--gutter)",
}: {
  left: ReactNode;
  right: ReactNode;
  center?: ReactNode;
  label?: string;
  /** Horizontal pad. The portfolio and Network use the column gutter. */
  inset?: string;
}) {
  return (
    <nav
      aria-label={label}
      className="compass-sky-band pointer-events-auto absolute inset-x-0 bottom-0 z-30 bg-sky t-band text-[var(--ink)] select-none [-webkit-touch-callout:none]"
      style={{
        paddingBottom: "env(safe-area-inset-bottom)",
        WebkitUserSelect: "none",
        userSelect: "none",
      }}
    >
      <div
        className="flex items-stretch"
        style={{ height: BAND_ROW_PX, paddingLeft: inset, paddingRight: inset }}
      >
        <div className="flex min-h-11 min-w-0 flex-1 items-stretch">{left}</div>
        {center != null ? (
          <div className="flex min-h-11 min-w-0 flex-1 items-stretch justify-center">{center}</div>
        ) : null}
        <div className="flex min-h-11 min-w-0 flex-1 items-stretch justify-end">{right}</div>
      </div>
    </nav>
  );
}

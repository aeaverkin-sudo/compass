import type { ReactNode } from "react";
import { BAND_DROP_PX, BAND_ROW_PX } from "../layout";

/**
 * The sky bar. Last child of the page column, one row, one height.
 * Padding under the row is the home indicator minus the 29px the old plate did not carry.
 */
export function TabBand({
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
      className="compass-sky-band pointer-events-auto relative z-30 w-full shrink-0 bg-sky t-band text-[var(--ink)] select-none [-webkit-touch-callout:none]"
      style={{
        paddingBottom: `max(0px, calc(env(safe-area-inset-bottom) - ${BAND_DROP_PX}px))`,
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

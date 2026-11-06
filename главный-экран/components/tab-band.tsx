import type { ReactNode } from "react";
import { BAND_DROP_PX, BAND_ROW_PX } from "../layout";

const WORD = "[&>*]:!w-max [&_a]:!w-max [&_button]:!w-max [&_a]:-mr-[0.14em] [&_button]:-mr-[0.14em]";

/**
 * The sky bar. Last child of the page column, one row, one height.
 * Padding under the row is the home indicator minus the 29px the old plate did not carry.
 * Three words each sit in the middle of an equal third. Two words stay at the side fields.
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
      {center != null ? (
        <div className="grid items-stretch" style={{ height: BAND_ROW_PX, gridTemplateColumns: "1fr 1fr 1fr" }}>
          <div className={`flex min-h-11 w-max items-stretch justify-self-center ${WORD}`}>{left}</div>
          <div className={`flex min-h-11 w-max items-stretch justify-self-center ${WORD}`}>{center}</div>
          <div className={`flex min-h-11 w-max items-stretch justify-self-center ${WORD}`}>{right}</div>
        </div>
      ) : (
        <div
          className="flex items-stretch"
          style={{ height: BAND_ROW_PX, paddingLeft: inset, paddingRight: inset }}
        >
          <div className="flex min-h-11 min-w-0 flex-1 items-stretch">{left}</div>
          <div className="flex min-h-11 min-w-0 flex-1 items-stretch justify-end">{right}</div>
        </div>
      )}
    </nav>
  );
}

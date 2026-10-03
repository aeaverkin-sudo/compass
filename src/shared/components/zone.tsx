import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { COLUMN_GAP_PX, LABEL_COLUMN_PX } from "@/shared/layout/axes";

export function Zone({
  label,
  children,
  align = "baseline",
  rule = false,
  id,
}: {
  label: string;
  children: ReactNode;
  align?: "baseline" | "start";
  rule?: boolean;
  id?: string;
}) {
  return (
    <section
      id={id}
      className={cn("min-w-0 py-[18px]", id && "scroll-mt-16", rule && "border-b border-[var(--rule)]")}
    >
      <div
        className={cn("grid", align === "start" ? "items-start" : "items-baseline")}
        style={{ gridTemplateColumns: `${LABEL_COLUMN_PX}px minmax(0, 1fr)`, columnGap: COLUMN_GAP_PX }}
      >
        <span className="t-label whitespace-nowrap">{label}</span>
        <div className="min-w-0">{children}</div>
      </div>
    </section>
  );
}

import { ArrowUp } from "lucide-react";

/** Thin black arrow above the end of a Position or Company label, clear of the word. */
export function PromoteArrow() {
  return (
    <ArrowUp
      className="pointer-events-none absolute left-full top-0 ml-px -translate-y-[45%] size-3 text-[var(--ink)]"
      strokeWidth={1}
      aria-hidden
    />
  );
}

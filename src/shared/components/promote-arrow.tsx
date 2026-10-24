import { ArrowUp } from "lucide-react";

/** Thin black arrow at the end of a Position or Company label. */
export function PromoteArrow() {
  return <ArrowUp className="ml-1 inline-block size-3 shrink-0 align-middle text-[var(--ink)]" strokeWidth={1} aria-hidden />;
}

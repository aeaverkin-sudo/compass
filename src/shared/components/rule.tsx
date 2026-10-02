import { cn } from "@/lib/utils";

/** One horizontal rule: 1px, the rule token. Height stays 1px when the line stretches. */
export function Rule({ className }: { className?: string }) {
  return <div aria-hidden className={cn("h-px w-full", className)} style={{ background: "var(--rule)" }} />;
}

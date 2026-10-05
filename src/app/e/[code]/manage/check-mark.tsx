import { Check } from "lucide-react";

/** Sky square with a tick. Checked-in on the guest list and on a successful scan. */
export function CheckMark({ large = false }: { large?: boolean }) {
  return (
    <span
      aria-hidden
      className={
        large
          ? "inline-flex size-8 shrink-0 items-center justify-center bg-sky text-[var(--ink)]"
          : "inline-flex size-3.5 shrink-0 items-center justify-center bg-sky text-[var(--ink)]"
      }
    >
      <Check className={large ? "size-4" : "size-2.5"} strokeWidth={2.5} />
    </span>
  );
}

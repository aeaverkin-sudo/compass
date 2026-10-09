import { Scan } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

/** Four corners. 20px ink, no fill, no caption. */
export function ScanIcon() {
  return <Scan className="size-5 text-[var(--ink)]" strokeWidth={1.25} aria-hidden />;
}

/** The same scan control on the portfolio QR and on Network. */
export function ScanButton({ className }: { className?: string }) {
  return (
    <Link
      href="/scan"
      aria-label="Scan"
      data-no-swipe
      className={cn(
        "pointer-events-auto flex size-11 items-center justify-end text-[var(--ink)] [-webkit-tap-highlight-color:transparent]",
        className,
      )}
    >
      <ScanIcon />
    </Link>
  );
}

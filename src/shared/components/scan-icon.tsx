import { Scan } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

/** Four corners. Same grey and a similar weight to the 1/3 counter. No fill, no caption. */
export function ScanIcon() {
  return <Scan className="size-[16.1px]" strokeWidth={1} aria-hidden />;
}

/** The same scan control on the portfolio QR and on Network. */
export function ScanButton({ corner = false, className }: { corner?: boolean; className?: string }) {
  return (
    <Link
      href="/scan"
      aria-label="Scan"
      data-no-swipe
      className={cn(
        "pointer-events-auto flex size-11 touch-manipulation justify-end text-[var(--grey)] [-webkit-tap-highlight-color:transparent]",
        corner ? "items-start" : "items-center",
        className,
      )}
      style={corner ? { marginRight: "calc(-0.1em - 0.5px)", fontSize: 11 } : undefined}
    >
      <ScanIcon />
    </Link>
  );
}

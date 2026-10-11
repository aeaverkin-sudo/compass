import { Scan } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

/** Four corners. Same ink stroke as the rail Share mark. No fill, no caption. */
function ScanIcon({ size = 16.2, stroke = 0.9 }: { size?: number; stroke?: number }) {
  return <Scan size={size} strokeWidth={stroke} aria-hidden />;
}

/** The same scan control on the portfolio QR and on Network. */
export function ScanButton({
  size,
  stroke,
  className,
}: {
  size?: number;
  stroke?: number;
  className?: string;
}) {
  return (
    <Link
      href="/scan"
      aria-label="Scan"
      data-no-swipe
      className={cn(
        "pointer-events-auto flex size-11 touch-manipulation items-center justify-end text-[var(--ink)] [-webkit-tap-highlight-color:transparent]",
        className,
      )}
    >
      <ScanIcon size={size} stroke={stroke} />
    </Link>
  );
}

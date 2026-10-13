import Link from "next/link";
import { cn } from "@/lib/utils";

/** Under the poster: who's going, and after the event how many you met. */
export function GoingLine({
  lookup,
  going,
  wereThere,
  met,
  ended,
  className,
}: {
  lookup: string;
  going: number;
  wereThere: number;
  met: number;
  ended: boolean;
  className?: string;
}) {
  const text = ended ? `You met ${met} · ${wereThere} were there` : `${going} going ›`;
  return (
    <Link
      href={`/e/${encodeURIComponent(lookup)}/going`}
      className={cn(
        "press inline-block t-body text-[var(--ink)] no-underline [-webkit-tap-highlight-color:transparent]",
        className,
      )}
    >
      {text}
    </Link>
  );
}

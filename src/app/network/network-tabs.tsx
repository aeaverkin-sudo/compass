import Link from "next/link";
import { cn } from "@/lib/utils";
import { TabBand } from "@main/components/tab-band";

const ITEM =
  "flex h-full min-h-11 w-full items-center uppercase [-webkit-tap-highlight-color:transparent]";

/** Event has no screen yet. Connections is the book. Data is the counts. */
export function NetworkTabs({ active }: { active: "connections" | "data" }) {
  return (
    <TabBand
      label="Network"
      left={<span className={ITEM}>Event</span>}
      center={
        <Link href="/network" className={cn(ITEM, "justify-center", active === "connections" && "font-medium")}>
          Connections
        </Link>
      }
      right={
        <Link href="/network/data" className={cn(ITEM, "justify-end", active === "data" && "font-medium")}>
          Data
        </Link>
      }
    />
  );
}

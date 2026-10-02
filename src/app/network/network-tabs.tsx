import Link from "next/link";
import { TabBand } from "@main/components/tab-band";

const ITEM =
  "flex h-full min-h-11 w-full items-center uppercase [-webkit-tap-highlight-color:transparent]";

/** Connections stays in the code, hidden on the bar. Event is the door. Data is the counts. The book stays at /network. */
export function NetworkTabs() {
  return (
    <TabBand
      label="Network"
      left={
        <Link href="/network/event" className={ITEM}>
          Event
        </Link>
      }
      center={
        <Link href="/network/connections" aria-hidden tabIndex={-1} className={`${ITEM} hidden justify-center`}>
          Connections
        </Link>
      }
      right={
        <Link href="/network/data" className={`${ITEM} justify-end`}>
          Data
        </Link>
      }
    />
  );
}

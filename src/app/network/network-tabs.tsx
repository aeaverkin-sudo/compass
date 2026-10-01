import Link from "next/link";
import { TabBand } from "@main/components/tab-band";

const ITEM =
  "flex h-full min-h-11 w-full items-center uppercase [-webkit-tap-highlight-color:transparent]";

/** Event has no screen yet. Connections is the search. Data is the counts. The book stays at /network. */
export function NetworkTabs() {
  return (
    <TabBand
      label="Network"
      left={<span className={ITEM}>Event</span>}
      center={
        <Link href="/network/connections" className={`${ITEM} justify-center`}>
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

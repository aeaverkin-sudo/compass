"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { TabBand } from "@main/components/tab-band";

const ITEM =
  "press flex h-full min-h-11 w-full items-center border-0 bg-transparent p-0 font-[inherit] text-inherit uppercase [-webkit-tap-highlight-color:transparent]";

/** Clockwise: Network → Data → Event → Network. The right slot is the next stop. */
const ORDER = ["network", "data", "event"] as const;

export type NetworkSection = (typeof ORDER)[number];

const ROUTE: Record<NetworkSection, string> = {
  network: "/network",
  data: "/network/data",
  event: "/network/event",
};

const LABEL: Record<NetworkSection, string> = {
  network: "Network",
  data: "Data",
  event: "Event",
};

/** The two sections that are not on screen, in clockwise order. */
export function NetworkBand({ current }: { current: NetworkSection }) {
  const router = useRouter();
  const index = ORDER.indexOf(current);
  const left = ORDER[(index + 2) % 3];
  const right = ORDER[(index + 1) % 3];

  useEffect(() => {
    router.prefetch(ROUTE[left]);
    router.prefetch(ROUTE[right]);
    router.prefetch("/main");
  }, [router, left, right]);

  return (
    <TabBand
      label="Network"
      left={
        <button type="button" onClick={() => router.push(ROUTE[left])} className={ITEM}>
          {LABEL[left]}
        </button>
      }
      center={
        <button type="button" onClick={() => router.push("/main")} className={`${ITEM} justify-center`}>
          Home
        </button>
      }
      right={
        <button type="button" onClick={() => router.push(ROUTE[right])} className={`${ITEM} justify-end`}>
          {LABEL[right]}
        </button>
      }
    />
  );
}

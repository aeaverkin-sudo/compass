"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { BottomBand } from "@main/components/tab-band";
import { TapButton } from "@/shared/components/tap-button";

const ITEM =
  "press touch-manipulation flex h-full min-h-11 w-full items-center border-0 bg-transparent p-0 font-[inherit] text-inherit uppercase [-webkit-tap-highlight-color:transparent]";

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

  const go = (href: string) => ({
    onPrepare: () => router.prefetch(href),
    onTap: () => router.push(href),
  });

  return (
    <BottomBand
      label="Network"
      left={
        <TapButton className={ITEM} {...go(ROUTE[left])}>
          {LABEL[left]}
        </TapButton>
      }
      center={
        <TapButton className={`${ITEM} justify-center`} {...go("/main")}>
          Home
        </TapButton>
      }
      right={
        <TapButton className={`${ITEM} justify-end`} {...go(ROUTE[right])}>
          {LABEL[right]}
        </TapButton>
      }
    />
  );
}

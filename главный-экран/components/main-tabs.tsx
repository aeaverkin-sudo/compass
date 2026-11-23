"use client";

import { useEffect, startTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { TabBand } from "./tab-band";
import { TapButton } from "@/shared/components/tap-button";
import { useNetworkDot } from "@/shared/lib/network-dot";
import { cn } from "@/lib/utils";

export type MainSection = "account" | "portfolio" | "network";

const HREF: Record<MainSection, string> = {
  account: "/profile",
  portfolio: "/main",
  network: "/network",
};

const LABEL: Record<MainSection, string> = {
  account: "Account",
  portfolio: "Portfolio",
  network: "Network",
};

const WORD =
  "flex h-full min-h-11 items-center border-0 bg-transparent p-0 t-caps text-[var(--ink)] [-webkit-tap-highlight-color:transparent]";

/**
 * Account, Portfolio, Network. One sky row on the three main screens.
 * The current word is semibold. The orange dot is only the Network signal.
 */
export function MainTabs({ current }: { current?: MainSection }) {
  const router = useRouter();
  const networkDot = useNetworkDot();

  useEffect(() => {
    router.prefetch(HREF.account);
    router.prefetch(HREF.portfolio);
    router.prefetch(HREF.network);
  }, [router]);

  const go = (section: MainSection) => {
    if (section === current) return;
    startTransition(() => router.push(HREF[section]));
  };

  const word = (section: MainSection, align: string, label: ReactNode) => {
    const on = section === current;
    return (
      <TapButton
        aria-current={on ? "page" : undefined}
        onPrepare={() => {
          if (!on) router.prefetch(HREF[section]);
        }}
        onTap={() => go(section)}
        className={cn(WORD, !on && "press", align)}
        style={on ? { fontWeight: 600 } : undefined}
      >
        {label}
      </TapButton>
    );
  };

  return (
    <TabBand
      label="Main"
      left={word("account", "justify-start", LABEL.account)}
      center={word("portfolio", "justify-center", LABEL.portfolio)}
      right={word(
        "network",
        "justify-end",
        <span className="relative">
          {LABEL.network}
          {networkDot ? (
            <span
              aria-hidden
              className="pointer-events-none absolute top-0 right-0 rounded-full bg-[var(--event-theme-orange)]"
              style={{
                width: "calc(0.375rem * 0.95)",
                height: "calc(0.375rem * 0.95)",
                transform: "translate(50%, calc(-50% - 4px))",
              }}
            />
          ) : null}
        </span>,
      )}
    />
  );
}

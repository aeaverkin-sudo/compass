"use client";

import { useRouter } from "next/navigation";

type BackButtonProps = {
  /** Where to go when this page was opened directly and there is no previous screen. */
  fallbackHref: string;
  /** Profile only: stay put while the title scrolls, centered on PROFILE. */
  pinned?: boolean;
};

/**
 * The only back control. Same icon and same screen position on every nested page.
 * Left edge is the 26px gutter. Top is 52px. The chevron itself is 22×22.
 */
export function BackButton({ fallbackHref, pinned = false }: BackButtonProps) {
  const router = useRouter();

  const go = () => {
    if (window.history.length > 1) router.back();
    else router.push(fallbackHref);
  };

  return (
    <button
      type="button"
      aria-label="Back"
      onClick={go}
      className={
        pinned
          ? "fixed top-10 left-8 z-30 flex h-[22px] w-11 -translate-y-px items-center justify-start text-[#111]"
          : "fixed top-[52px] left-[26px] z-30 flex size-11 items-start justify-start text-[#111]"
      }
    >
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden>
        <path
          d="M15 5l-7 7 7 7"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}

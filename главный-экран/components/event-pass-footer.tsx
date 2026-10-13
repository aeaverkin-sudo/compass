"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { KeepProfileButton } from "@/shared/components/keep-profile-button";
import { SkyToast } from "@/shared/components/sky-toast";

/** Under the rows of a guest's event card: add more, then Wallet before the end or Keep after it. */
export function EventPassFooter({
  eventName,
  ended,
  frozenHoursLeft,
  onAdd,
}: {
  eventName: string;
  ended: boolean;
  frozenHoursLeft: number | null;
  onAdd: () => void;
}) {
  const [toast, setToast] = useState(false);
  const frozen = frozenHoursLeft !== null;

  return (
    <div className="flex flex-col items-center">
      {frozen ? null : (
        <>
          <button
            type="button"
            data-card-content
            data-no-swipe
            aria-label="Add"
            onClick={onAdd}
            className="flex size-7 items-center justify-center bg-transparent"
          >
            <Plus className="size-7 text-[var(--ink)]" strokeWidth={1} aria-hidden />
          </button>
          <p className="mt-2 mb-0 max-w-[260px] text-center t-meta text-[var(--grey)]">
            Add your contacts, links, professional details, social media and files — the portfolio you share at this event.
          </p>
        </>
      )}
      <div className={frozen ? undefined : "mt-6"}>
        {ended || frozen ? (
          <KeepProfileButton />
        ) : (
          <button
            type="button"
            data-card-content
            data-no-swipe
            onClick={() => setToast(true)}
            className="press border-0 bg-sky px-[21.6px] py-[10.8px] t-caps text-[var(--ink)]"
          >
            Add to Apple Wallet
          </button>
        )}
      </div>
      <p className="mt-3 mb-0 max-w-[260px] text-center t-meta text-[var(--grey)]">
        {frozen
          ? `Your card is frozen for ${frozenHoursLeft} hours, then it will be deleted.`
          : ended
            ? `${eventName} is over. Your card and the people you met stay for 60 hours.`
            : "Save this pass to enter the event."}
      </p>
      {toast ? <SkyToast text="Apple Wallet · coming soon" onDone={() => setToast(false)} /> : null}
    </div>
  );
}

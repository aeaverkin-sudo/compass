"use client";

import { TabBand } from "@main/components/tab-band";
import { TapButton } from "@/shared/components/tap-button";
import { acceptConnection, declineConnection, undoDecline, useConnectionDecisions } from "@/shared/lib/connection-decision";

const ITEM =
  "press touch-manipulation flex h-full min-h-11 w-full items-center whitespace-nowrap border-0 bg-transparent p-0 font-[inherit] text-inherit uppercase [-webkit-tap-highlight-color:transparent]";

/** Skip and Confirm on an opened request. The same sky row as Profile, Edit, and Network. */
export function PendingShare({ id }: { id: string }) {
  const decisions = useConnectionDecisions();
  if (decisions.gone.has(id) || decisions.accepting.has(id)) return null;
  const removing = decisions.removing.has(id);

  if (removing) {
    return (
      <TabBand
        label="Request"
        left={<span className="min-h-11 w-full" />}
        center={<span className="min-h-11 w-full" />}
        right={
          <TapButton className={`${ITEM} justify-end`} onTap={() => undoDecline(id)}>
            Undo
          </TapButton>
        }
      />
    );
  }

  return (
    <TabBand
      label="Request"
      left={
        <TapButton className={ITEM} onTap={() => declineConnection(id)}>
          Skip
        </TapButton>
      }
      center={<span className="min-h-11 w-full" />}
      right={
        <TapButton className={`${ITEM} justify-end`} onTap={() => acceptConnection(id)}>
          Confirm
        </TapButton>
      }
    />
  );
}

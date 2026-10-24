"use client";

import { HEADER_ROW_PX } from "@/shared/layout/axes";
import { SCREEN_TOP_AXIS_PX } from "@main/layout";
import { NoButton, UndoRow, YesButton } from "@/shared/components/pending-decision";
import { acceptConnection, declineConnection, undoDecline, useConnectionDecisions } from "@/shared/lib/connection-decision";

/** The same Yes / No as the list, on the opened card. */
export function PendingShare({ id, name }: { id: string; name: string }) {
  const decisions = useConnectionDecisions();
  if (decisions.gone.has(id) || decisions.accepting.has(id)) return null;
  const removing = decisions.removing.has(id);
  const label = name.trim() || "Someone";
  const top = `calc(env(safe-area-inset-top) + ${SCREEN_TOP_AXIS_PX}px + ${HEADER_ROW_PX / 2}px)`;

  return (
    <>
      <p
        className="fixed inset-x-0 z-20 truncate bg-white px-[var(--gutter)] py-2 t-meta text-[var(--grey)]"
        style={{ top }}
      >
        Pending — {label} shared their card with you.
      </p>
      <div
        className="fixed inset-x-0 bottom-0 z-30 bg-white px-[var(--gutter)] pt-3"
        style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}
      >
        {removing ? (
          <div className="py-3">
            <UndoRow onUndo={() => undoDecline(id)} />
          </div>
        ) : (
          <div className="flex gap-2">
            <YesButton className="min-w-0 flex-1 py-3" onClick={() => acceptConnection(id)} />
            <NoButton className="min-w-0 flex-1 py-3" onClick={() => declineConnection(id)} />
          </div>
        )}
      </div>
    </>
  );
}

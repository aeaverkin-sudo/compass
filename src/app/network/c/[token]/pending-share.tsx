"use client";

import { SkyActions } from "@/shared/components/sky-actions";
import { acceptConnection, declineConnection, undoDecline, useConnectionDecisions } from "@/shared/lib/connection-decision";

/** Skip and Confirm on an opened request. The same sky row as the hold menu. */
export function PendingShare({ id }: { id: string }) {
  const decisions = useConnectionDecisions();
  if (decisions.gone.has(id) || decisions.accepting.has(id)) return null;
  const removing = decisions.removing.has(id);

  if (removing) {
    return (
      <SkyActions
        dock
        actions={[{ label: "Undo", tone: "ink", onPress: () => undoDecline(id) }]}
      />
    );
  }

  return (
    <SkyActions
      dock
      actions={[
        { label: "Skip", tone: "grey", onPress: () => declineConnection(id) },
        { label: "Confirm", tone: "ink", onPress: () => acceptConnection(id) },
      ]}
    />
  );
}

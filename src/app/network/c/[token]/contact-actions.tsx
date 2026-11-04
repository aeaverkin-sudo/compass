"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SkyActions } from "@/shared/components/sky-actions";
import { sendShareBack, undoShareBack, useShareBack } from "@/shared/lib/share-back-send";
import { createBrowserSupabaseClient } from "@/shared/lib/supabase/browser";

/** Delete and Share back on an opened contact. The same sky row as the hold menu. */
export function ContactActions({ id, token }: { id: string; token: string }) {
  const router = useRouter();
  const phase = useShareBack(token);
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);

  const remove = async () => {
    if (busy) return;
    setBusy(true);
    const { data } = await createBrowserSupabaseClient().auth.getSession();
    const userId = data.session?.user.id;
    const { error } = userId
      ? await createBrowserSupabaseClient().from("connections").delete().eq("id", id).eq("owner_id", userId)
      : { error: { message: "signed out" } };
    if (error) {
      setBusy(false);
      setArmed(false);
      return;
    }
    router.push("/network");
  };

  const shareLabel = phase === "undo" ? "Undo" : phase === "sent" ? "Shared back" : "Share back";

  return (
    <SkyActions
      dock
      actions={[
        {
          label: armed ? "Yes, delete" : "Delete",
          tone: "danger",
          onPress: () => {
            if (!armed) {
              setArmed(true);
              return;
            }
            void remove();
          },
        },
        {
          label: shareLabel,
          tone: phase === "sent" ? "grey" : "ink",
          disabled: phase === "sent" || busy,
          onPress: () => {
            if (phase === "undo") {
              void undoShareBack(token);
              return;
            }
            if (phase === "idle") void sendShareBack(token);
          },
        },
      ]}
    />
  );
}

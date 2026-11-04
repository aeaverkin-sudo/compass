"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { TabBand } from "@main/components/tab-band";
import { TapButton } from "@/shared/components/tap-button";
import { sendShareBack, undoShareBack, useShareBack } from "@/shared/lib/share-back-send";
import { createBrowserSupabaseClient } from "@/shared/lib/supabase/browser";

const ITEM =
  "press touch-manipulation flex h-full min-h-11 w-full items-center whitespace-nowrap border-0 bg-transparent p-0 font-[inherit] text-inherit uppercase [-webkit-tap-highlight-color:transparent]";

/** Delete and Share back on an opened contact. Same sky row and the same three columns as Profile / Home / Network. */
export function ContactActions({ id, token }: { id: string; token: string }) {
  const router = useRouter();
  const phase = useShareBack(token);
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const deleteRef = useRef<HTMLSpanElement>(null);
  const cancelTap = useRef(false);

  useEffect(() => {
    if (!armed) return;
    const down = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && deleteRef.current?.contains(target)) return;
      cancelTap.current = true;
      setArmed(false);
      const up = () => {
        document.removeEventListener("pointerup", up, true);
        document.removeEventListener("pointercancel", up, true);
        queueMicrotask(() => {
          cancelTap.current = false;
        });
      };
      document.addEventListener("pointerup", up, true);
      document.addEventListener("pointercancel", up, true);
    };
    document.addEventListener("pointerdown", down, true);
    return () => document.removeEventListener("pointerdown", down, true);
  }, [armed]);

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
    <TabBand
      label="Contact"
      left={
        <span ref={deleteRef} className="flex h-full w-full">
          <TapButton
            className={ITEM}
            disabled={busy}
            onTap={() => {
              if (!armed) {
                setArmed(true);
                return;
              }
              void remove();
            }}
          >
            {armed ? "Yes, delete" : "Delete"}
          </TapButton>
        </span>
      }
      center={<span className="min-h-11 w-full" />}
      right={
        <TapButton
          className={`${ITEM} justify-end disabled:text-[var(--grey)]`}
          disabled={phase === "sent" || busy}
          onTap={() => {
            if (cancelTap.current) return;
            if (phase === "undo") {
              void undoShareBack(token);
              return;
            }
            if (phase === "idle") void sendShareBack(token);
          }}
        >
          {shareLabel}
        </TapButton>
      }
    />
  );
}

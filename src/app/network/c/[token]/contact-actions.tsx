"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { TabBand } from "@main/components/tab-band";
import { TapButton } from "@/shared/components/tap-button";
import { SharePick, useNamedShareCards, type SharePickCard } from "@/shared/components/share-pick";
import { SkyToast } from "@/shared/components/sky-toast";
import { forgetShareBack, sendShareBack, useShareBack } from "@/shared/lib/share-back-send";
import { createBrowserSupabaseClient } from "@/shared/lib/supabase/browser";

const ITEM =
  "press touch-manipulation flex h-full min-h-11 w-full items-center whitespace-nowrap border-0 bg-transparent p-0 font-[inherit] text-inherit uppercase [-webkit-tap-highlight-color:transparent]";

/** Delete, Home, and Swap until they have my card, then Back. */
export function ContactActions({
  id,
  token,
  theyHaveMe = false,
  shareBackPending = false,
}: {
  id: string;
  token: string;
  theyHaveMe?: boolean;
  shareBackPending?: boolean;
}) {
  const router = useRouter();
  const phase = useShareBack(token);
  const shareCards = useNamedShareCards();
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [bandHeight, setBandHeight] = useState(0);
  const deleteRef = useRef<HTMLSpanElement>(null);
  const bandRef = useRef<HTMLDivElement>(null);
  const cancelTap = useRef(false);

  useEffect(() => {
    router.prefetch("/main");
    router.prefetch("/network");
  }, [router]);

  useLayoutEffect(() => {
    const node = bandRef.current;
    if (!node) return;
    const measure = () => setBandHeight(node.offsetHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

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
    const drop = async () => {
      const { data } = await createBrowserSupabaseClient().auth.getSession();
      const userId = data.session?.user.id;
      const { error } = userId
        ? await createBrowserSupabaseClient().from("connections").delete().eq("id", id).eq("owner_id", userId)
        : { error: { message: "signed out" } };
      return !error;
    };
    let dropped = false;
    try {
      dropped = await drop();
    } catch {
      dropped = false;
    }
    if (!dropped) {
      await new Promise((resolve) => window.setTimeout(resolve, 1500));
      try {
        dropped = await drop();
      } catch {
        dropped = false;
      }
    }
    if (!dropped) {
      setBusy(false);
      setArmed(false);
      return;
    }
    forgetShareBack(token);
    router.push("/network");
  };

  const canSwap = !theyHaveMe && !shareBackPending && phase === "idle";

  const shareCard = async (card: SharePickCard) => {
    const sent = await sendShareBack(token, card.id);
    if (!sent) return;
    setPicking(false);
    setNotice(`${card.name} shared back`);
  };

  return (
    <>
      {picking ? (
        <button
          type="button"
          aria-label="Close"
          className="fixed inset-0 z-20 border-0 bg-white/55 p-0"
          onClick={() => setPicking(false)}
        />
      ) : null}
      {picking ? (
        <div className="fixed inset-x-0 z-40 bg-sky px-[var(--gutter)] py-3" style={{ bottom: bandHeight }}>
          <SharePick cards={shareCards} size="plaque" onPick={(card) => void shareCard(card)} />
        </div>
      ) : null}
      {notice ? <SkyToast key={notice} text={notice} onDone={() => setNotice(null)} /> : null}
      <div ref={bandRef}>
        <TabBand
          label="Contact"
          left={
            <span ref={deleteRef} className="flex h-full w-full">
              <TapButton
                className={ITEM}
                disabled={busy}
                onTap={() => {
                  if (picking) {
                    setPicking(false);
                    return;
                  }
                  if (!armed) {
                    setArmed(true);
                    return;
                  }
                  void remove();
                }}
              >
                {armed ? "Delete?" : "Delete"}
              </TapButton>
            </span>
          }
          center={
            <TapButton
              className={`${ITEM} justify-center`}
              onPrepare={() => router.prefetch("/main")}
              onTap={() => router.push("/main")}
            >
              Home
            </TapButton>
          }
          right={
            canSwap ? (
              <TapButton
                className={`${ITEM} justify-end`}
                onTap={() => {
                  if (cancelTap.current) return;
                  if (picking) {
                    setPicking(false);
                    return;
                  }
                  if (shareCards.length === 1) {
                    void shareCard(shareCards[0]!);
                    return;
                  }
                  if (shareCards.length < 2) return;
                  setArmed(false);
                  setPicking(true);
                }}
              >
                Swap
              </TapButton>
            ) : (
              <TapButton
                className={`${ITEM} justify-end`}
                onPrepare={() => router.prefetch("/network")}
                onTap={() => router.push("/network")}
              >
                Back
              </TapButton>
            )
          }
        />
      </div>
    </>
  );
}

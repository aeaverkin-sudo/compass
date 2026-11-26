"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { TabBand } from "@main/components/tab-band";
import { TapButton } from "@/shared/components/tap-button";
import { SharePick, useNamedShareCards, type SharePickCard } from "@/shared/components/share-pick";
import { SkyToast } from "@/shared/components/sky-toast";
import { useCardsHydrated } from "@/shared/hooks/use-cards-hydrated";
import { shareBackOffer } from "@/shared/lib/share-back-offer";
import { forgetShareBack, sendShareBack, SWAP_CLOSED, SWAP_CLOSED_HOLD_MS, useShareBack } from "@/shared/lib/share-back-send";
import { deleteConnectionRemote } from "@/shared/lib/delete-connection";
const ITEM =
  "press touch-manipulation flex h-full min-h-11 w-full items-center whitespace-nowrap border-0 bg-transparent p-0 font-[inherit] text-inherit uppercase [-webkit-tap-highlight-color:transparent]";

/** Delete, Home, and Swap until they have my card, then Back. */
export function ContactActions({
  id,
  token,
  theyHaveMe = false,
  shareBackPending = false,
  shareBackAt = null,
}: {
  id: string;
  token: string;
  theyHaveMe?: boolean;
  shareBackPending?: boolean;
  shareBackAt?: string | null;
}) {
  const router = useRouter();
  const phase = useShareBack(token);
  const shareCards = useNamedShareCards();
  const cardsReady = useCardsHydrated();
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
    const drop = async () => deleteConnectionRemote(id);
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

  const spent = Boolean(shareBackAt) || theyHaveMe || shareBackPending || phase !== "idle";
  const offer = shareBackOffer(
    shareCards.length,
    !spent && phase === "idle",
    cardsReady,
  );
  const canSwap = offer === "send";
  const swapLocked = offer === "create";

  const shareCard = async (card: SharePickCard) => {
    const sent = await sendShareBack(token, card.id);
    if (sent === "failed") {
      setNotice("Could not swap.");
      return;
    }
    setPicking(false);
    if (sent === "already") return;
    setNotice(sent === "declined" ? SWAP_CLOSED : `${card.name} shared back`);
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
      {notice ? (
        <SkyToast
          key={notice}
          text={notice}
          holdMs={notice === SWAP_CLOSED ? SWAP_CLOSED_HOLD_MS : undefined}
          onDone={() => setNotice(null)}
        />
      ) : null}
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
            spent ? (
              <TapButton className={`${ITEM} justify-end text-[var(--grey)]`} disabled onTap={() => undefined}>
                Swap
              </TapButton>
            ) : canSwap ? (
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
            ) : swapLocked ? (
              <TapButton
                className={`${ITEM} justify-end opacity-40`}
                onTap={() => {
                  if (cancelTap.current) return;
                  setNotice("Create a portfolio to swap.");
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

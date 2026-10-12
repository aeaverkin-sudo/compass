"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSessionBootstrap } from "@/shared/hooks/use-session-bootstrap";
import { createBrowserSupabaseClient } from "@/shared/lib/supabase/browser";
import { dropPendingItemUpserts } from "@/shared/services/card-items-sync";
import { dropPendingCardUpserts, hydrateCardsFromServer } from "@/shared/services/card-sync";
import { dropPendingNotes } from "@/shared/services/notes-sync";
import { useAppStore } from "@/shared/store/app-store";

const SKY =
  "press inline-block border-0 bg-sky px-[21.6px] py-[10.8px] t-caps text-[var(--ink)] disabled:text-[var(--grey)] [-webkit-tap-highlight-color:transparent]";

type AcceptReply = {
  kind?: "go" | "here" | "signin" | "other-device";
  next?: string;
  tokenHash?: string;
  cardId?: string | null;
  error?: string;
};

/** Another person's portfolios must not stay in this browser once the guest signs in. */
function clearLocal() {
  dropPendingCardUpserts();
  dropPendingItemUpserts();
  dropPendingNotes();
  const user = useAppStore.getState().user;
  useAppStore.setState({ cards: [], contactItems: [], currentCardIndex: 0, user: { ...user, onboarded: false } });
}

export function GuestAccept({ lookup, token, auto }: { lookup: string; token: string; auto: boolean }) {
  const router = useRouter();
  const sessionReady = useSessionBootstrap();
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const opened = useRef(false);
  const autoRan = useRef(false);
  const base = `/api/events/${encodeURIComponent(lookup)}`;

  useEffect(() => {
    if (opened.current) return;
    opened.current = true;
    void fetch(`${base}/guest-open`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    }).catch(() => undefined);
  }, [base, token]);

  const enterPass = async (cardId: string | null | undefined) => {
    await hydrateCardsFromServer();
    const state = useAppStore.getState();
    const index = cardId ? state.cards.findIndex((card) => card.id === cardId) : -1;
    if (index >= 0) state.setCurrentCardIndex(index);
    router.replace("/main");
  };

  const accept = async () => {
    if (busy) return;
    setBusy(true);
    setHint(null);
    try {
      const supabase = createBrowserSupabaseClient();
      const { data } = await supabase.auth.getUser();
      if (!data.user) await supabase.auth.signInAnonymously();
      const response = await fetch(`${base}/guest-accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const reply = (await response.json()) as AcceptReply;
      if (!response.ok || !reply.kind) {
        setHint(reply.error ?? "Could not open your pass.");
        setBusy(false);
        return;
      }
      if (reply.kind === "other-device") {
        setHint("Open this link on the phone you used first");
        setBusy(false);
        return;
      }
      if (reply.kind === "go" && reply.next) {
        window.location.assign(reply.next);
        return;
      }
      if (reply.kind === "signin" && reply.tokenHash) {
        clearLocal();
        const signed = await supabase.auth.verifyOtp({ token_hash: reply.tokenHash, type: "magiclink" });
        if (signed.error) {
          setHint("Could not open your pass.");
          setBusy(false);
          return;
        }
      }
      await enterPass(reply.cardId);
    } catch {
      setHint("Could not open your pass.");
      setBusy(false);
    }
  };

  const acceptRef = useRef(accept);
  useEffect(() => {
    acceptRef.current = accept;
  });
  useEffect(() => {
    if (!auto || !sessionReady || autoRan.current) return;
    autoRan.current = true;
    void acceptRef.current();
  }, [auto, sessionReady]);

  if (auto) {
    return hint ? <p className="mt-8 mb-0 text-center t-meta text-[var(--grey)]">{hint}</p> : null;
  }

  return (
    <div className="mt-8 flex flex-col items-center">
      <button type="button" disabled={busy || !sessionReady} onClick={() => void accept()} className={SKY}>
        I&apos;m going *
      </button>
      <p className="mt-3 mb-0 max-w-[280px] text-center t-meta text-[var(--grey)]">
        * I agree to the event rules,{" "}
        <Link href="/terms" className="text-[var(--grey)] underline">
          Terms
        </Link>{" "}
        and{" "}
        <Link href="/privacy" className="text-[var(--grey)] underline">
          Privacy
        </Link>
        .
      </p>
      {hint ? <p className="mt-3 mb-0 text-center t-meta text-[var(--ink)]">{hint}</p> : null}
    </div>
  );
}

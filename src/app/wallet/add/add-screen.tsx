"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { openWalletPass, WALLET_RECHECK_MS, WALLET_SOON } from "@/shared/lib/wallet-client";

type View = "load" | "expired" | "soon" | "in" | "add" | "error";

const BUTTON = "inline-block border-0 bg-sky px-6 py-3 t-caps text-[var(--ink)]";

function statusUrl(cardId: string, expires: string, signature: string) {
  const query = new URLSearchParams({ e: expires, s: signature });
  return `/api/cards/${encodeURIComponent(cardId)}/pass/status?${query}`;
}

function passUrl(cardId: string, expires: string, signature: string) {
  const query = new URLSearchParams({ e: expires, s: signature });
  return `/api/cards/${encodeURIComponent(cardId)}/pass?${query}`;
}

export function WalletAddScreen({
  cardId,
  expires,
  signature,
}: {
  cardId: string;
  expires: string;
  signature: string;
}) {
  const [view, setView] = useState<View>("load");
  const timers = useRef<number[]>([]);
  const signed = Boolean(cardId && expires && signature);

  useEffect(() => {
    if (!signed) {
      setView("expired");
      return;
    }
    let cancel = false;
    const read = () =>
      fetch(statusUrl(cardId, expires, signature), { cache: "no-store" })
        .then(async (response) => {
          if (cancel) return;
          if (response.status === 403 || response.status === 404) {
            setView("expired");
            return;
          }
          if (!response.ok) {
            setView("error");
            return;
          }
          const body = (await response.json()) as { configured?: boolean; added?: boolean };
          if (cancel) return;
          if (!body.configured) {
            setView("soon");
            return;
          }
          setView(body.added ? "in" : "add");
        })
        .catch(() => {
          if (!cancel) setView("error");
        });
    void read();
    return () => {
      cancel = true;
    };
  }, [cardId, expires, signature, signed]);

  useEffect(() => {
    return () => {
      for (const timer of timers.current) window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    if (view !== "add" || !signed) return;
    const look = () => {
      if (document.visibilityState === "hidden") return;
      void fetch(statusUrl(cardId, expires, signature), { cache: "no-store" })
        .then(async (response) => {
          if (!response.ok) return;
          const body = (await response.json()) as { added?: boolean };
          if (body.added) setView("in");
        })
        .catch(() => undefined);
    };
    document.addEventListener("visibilitychange", look);
    window.addEventListener("focus", look);
    return () => {
      document.removeEventListener("visibilitychange", look);
      window.removeEventListener("focus", look);
    };
  }, [view, signed, cardId, expires, signature]);

  const add = () => {
    void openWalletPass(passUrl(cardId, expires, signature)).then((opened) => {
      if (!opened) {
        setView("soon");
        return;
      }
      for (const delay of WALLET_RECHECK_MS) {
        const timer = window.setTimeout(() => {
          void fetch(statusUrl(cardId, expires, signature), { cache: "no-store" })
            .then(async (response) => {
              if (!response.ok) return;
              const body = (await response.json()) as { added?: boolean };
              if (body.added) setView("in");
            })
            .catch(() => undefined);
        }, delay);
        timers.current.push(timer);
      }
    });
  };

  return (
    <main className="compass-main flex h-dvh flex-col bg-white px-[var(--gutter)] pt-[max(2.5rem,env(safe-area-inset-top))] text-[var(--ink)]">
      <p className="t-label text-[var(--grey)]">Wallet</p>
      {view === "load" ? <p className="mt-[18px] t-body">…</p> : null}
      {view === "in" ? (
        <>
          <h1 className="mt-[18px] t-body">Already in Apple Wallet</h1>
          <p className="mt-2 t-body text-[var(--grey)]">Your card is in Wallet.</p>
          <Link href="/profile" className={`mt-6 ${BUTTON}`}>
            Open my profile
          </Link>
        </>
      ) : null}
      {view === "add" ? (
        <>
          <h1 className="mt-[18px] t-body">Add to Apple Wallet</h1>
          <button type="button" className={`mt-6 ${BUTTON}`} onClick={add}>
            Add to Apple Wallet
          </button>
        </>
      ) : null}
      {view === "soon" ? <p className="mt-[18px] t-body">{WALLET_SOON}</p> : null}
      {view === "expired" ? (
        <>
          <h1 className="mt-[18px] t-body">This link has expired.</h1>
          <p className="mt-2 t-body text-[var(--grey)]">Sign in and open Profile to add the card.</p>
          <Link href={`/register?signin=1&next=${encodeURIComponent("/profile")}`} className={`mt-6 ${BUTTON}`}>
            Sign in
          </Link>
        </>
      ) : null}
      {view === "error" ? (
        <>
          <p className="mt-[18px] t-body">Couldn&apos;t check Wallet.</p>
          <button type="button" className={`mt-6 ${BUTTON}`} onClick={() => window.location.reload()}>
            Try again
          </button>
        </>
      ) : null}
    </main>
  );
}

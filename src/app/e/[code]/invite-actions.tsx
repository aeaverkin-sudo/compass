"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSessionBootstrap } from "@/shared/hooks/use-session-bootstrap";
import { dropPendingItemUpserts } from "@/shared/services/card-items-sync";
import { dropPendingCardUpserts } from "@/shared/services/card-sync";
import { dropPendingNotes } from "@/shared/services/notes-sync";
import { useAppStore } from "@/shared/store/app-store";
import { COLUMN_GAP_PX, VALUE_AXIS_PX } from "@/shared/layout/axes";
import { TapButton } from "@/shared/components/tap-button";
const SKY =
  "press inline-block border-0 bg-sky px-[21.6px] py-[10.8px] text-center t-caps text-[var(--ink)] no-underline disabled:text-[var(--grey)] [-webkit-tap-highlight-color:transparent]";

/** Another person's portfolios must not stay in this browser once the guest signs in. */
export function clearLocal() {
  dropPendingCardUpserts();
  dropPendingItemUpserts();
  dropPendingNotes();
  const user = useAppStore.getState().user;
  useAppStore.setState({ cards: [], contactItems: [], currentCardIndex: 0, user: { ...user, onboarded: false } });
}

function Footnote({ openLink = false }: { openLink?: boolean }) {
  return (
    <p className="mt-3 mb-0 max-w-[280px] text-center t-meta text-[var(--grey)]">
      * I agree to the event rules,{" "}
      <Link href="/terms" className="text-[var(--grey)] underline">
        Terms
      </Link>{" "}
      and{" "}
      <Link href="/privacy" className="text-[var(--grey)] underline">
        Privacy
      </Link>
      .{openLink ? " The host sees my name and contact." : null}
    </p>
  );
}

type InviteActionsProps = {
  lookup: string;
  /** The personal link token. Null on the open link. */
  token: string | null;
  /** A registered account: one button, straight to the event page. */
  permanent: boolean;
  /** This account is already on the guest list. */
  registered?: boolean;
  /** Run the tap once the session is known: a return from sign-in, or a pass after the event. */
  auto: boolean;
  /** After the event only the personal link still opens a pass. */
  ended: boolean;
  signInHref: string;
  /** Where the pass goes once it is open, instead of the card. `wallet`: the Wallet pass of that card. */
  then?: string | null;
  poster: ReactNode;
  /** Every seat is taken. Someone already going still gets in. */
  soldOut?: boolean;
  /** The open link is off and this visitor has no pass: no buttons. */
  closed?: boolean;
  /** Seats left when the event has a limit. */
  placesLeft?: number | null;
  /** The I'm going button in the mail: no poster, the consent is the mail's. */
  source?: "page" | "mail";
  /** Shown while the auto tap runs, until a hint replaces it. */
  waitText?: string | null;
};

export function InviteActions({
  lookup,
  token,
  permanent,
  registered = false,
  auto,
  ended,
  signInHref,
  then: _then = null,
  poster,
  soldOut = false,
  closed = false,
  placesLeft = null,
  source: _source = "page",
  waitText = null,
}: InviteActionsProps) {
  const router = useRouter();
  const sessionReady = useSessionBootstrap();
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  void _then;
  void _source;
  const opened = useRef(false);
  const autoRan = useRef(false);
  const base = `/api/events/${encodeURIComponent(lookup)}`;
  const joinPath = `/e/${encodeURIComponent(lookup)}/join`;

  useEffect(() => {
    if (!token || opened.current) return;
    opened.current = true;
    void fetch(`${base}/guest-open`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    }).catch(() => undefined);
  }, [base, token]);

  const fail = (text: string) => {
    setHint(text);
    setBusy(false);
  };

  const joinOwn = async () => {
    if (busy) return;
    setBusy(true);
    setHint(null);
    try {
      const response = await fetch(`${base}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(token ? { token } : {}),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        return fail(body.error ?? "Could not join.");
      }
      router.push(joinPath);
    } catch {
      fail("Could not join.");
    }
  };

  const primary = joinOwn;
  const primaryRef = useRef(primary);
  useEffect(() => {
    primaryRef.current = primary;
  });
  useEffect(() => {
    if (!auto || !token || !sessionReady || autoRan.current) return;
    autoRan.current = true;
    void primaryRef.current();
  }, [auto, token, sessionReady]);

  if (registered) {
    return (
      <>
        {poster}
        <div className="mt-8 flex flex-col items-center">
          <p className="m-0 bg-sky px-[21.6px] py-[10.8px] text-center t-caps text-[var(--ink)]">You&apos;re going ✓</p>
          <div className="mt-6 flex w-full max-w-[280px] min-w-0 items-center" style={{ gap: COLUMN_GAP_PX }}>
            <span className="min-w-0 flex-1" />
            <Link
              href={joinPath}
              className="press shrink-0 t-body text-[var(--ink)] no-underline [-webkit-tap-highlight-color:transparent]"
            >
              Change ›
            </Link>
          </div>
        </div>
      </>
    );
  }

  if (ended || (auto && token)) {
    return (
      <>
        {poster}
        {hint ? (
          <p className="mt-8 mb-0 text-center t-meta text-[var(--grey)]">{hint}</p>
        ) : waitText ? (
          <p className="m-0 text-center t-meta text-[var(--grey)]">{waitText}</p>
        ) : null}
      </>
    );
  }

  const shut = (closed && !token) || (soldOut && !token);
  const createHref = `/e/${encodeURIComponent(lookup)}/create${token ? `?g=${encodeURIComponent(token)}` : ""}`;
  const createFlow = !shut && !permanent;

  return (
    <>
      {poster}
      <div className="mt-8 flex flex-col items-center">
        {closed && !token ? (
          <>
            <p className="m-0 text-center t-meta text-[var(--grey)]">This event is by invitation.</p>
            {permanent ? null : (
              <Link
                href={signInHref}
                className="press mt-4 inline-block t-caps text-[var(--grey)] no-underline [-webkit-tap-highlight-color:transparent]"
              >
                Open in my account
              </Link>
            )}
          </>
        ) : soldOut && !token ? (
          <>
            <p className="m-0 t-caps text-[var(--grey)]">Sold out</p>
            {permanent ? null : (
              <Link
                href={signInHref}
                className="press mt-4 inline-block t-caps text-[var(--grey)] no-underline [-webkit-tap-highlight-color:transparent]"
              >
                Open in my account
              </Link>
            )}
          </>
        ) : permanent ? (
          <>
            <TapButton disabled={busy} onTap={() => void primary()} className={SKY}>
              I&apos;m going *
            </TapButton>
          </>
        ) : createFlow ? (
          <div className="self-stretch" style={{ paddingLeft: VALUE_AXIS_PX }}>
            <Link href={createHref} className={SKY}>
              Create
            </Link>
            {placesLeft != null ? (
              <p className="mt-3 mb-0 t-meta text-[var(--grey)]">{`${placesLeft} ${placesLeft === 1 ? "place" : "places"} left`}</p>
            ) : null}
            <p className="mt-3 mb-0 t-meta text-[var(--grey)]">
              Already have an account?{" "}
              <Link href={signInHref} className="text-[var(--grey)] underline">
                Sign in
              </Link>
            </p>
          </div>
        ) : null}
        {(closed && !token) || createFlow ? null : <Footnote openLink={!token} />}
        {permanent || shut || createFlow ? null : (
          <p className="mt-3 mb-0 text-center t-meta text-[var(--grey)]">
            Already have an account?{" "}
            <Link href={signInHref} className="text-[var(--grey)] underline">
              Sign in
            </Link>
          </p>
        )}
        {hint ? <p className="mt-3 mb-0 text-center t-meta text-[var(--ink)]">{hint}</p> : null}
      </div>
    </>
  );
}

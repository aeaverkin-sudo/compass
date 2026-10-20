"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SkyToast } from "@/shared/components/sky-toast";
import { useSessionBootstrap } from "@/shared/hooks/use-session-bootstrap";
import { createBrowserSupabaseClient } from "@/shared/lib/supabase/browser";
import { dropPendingItemUpserts } from "@/shared/services/card-items-sync";
import { dropPendingCardUpserts, hydrateCardsFromServer } from "@/shared/services/card-sync";
import { dropPendingNotes } from "@/shared/services/notes-sync";
import { useAppStore } from "@/shared/store/app-store";
import { COLUMN_GAP_PX, VALUE_AXIS_PX } from "@/shared/layout/axes";
import type { PortfolioChoice } from "@/shared/services/event-registration";
import { PortfolioFace } from "@/shared/components/portfolio-face";
import { TapButton } from "@/shared/components/tap-button";
import { openWalletPass } from "@/shared/lib/wallet-client";
const SKY =
  "press inline-block border-0 bg-sky px-[21.6px] py-[10.8px] text-center t-caps text-[var(--ink)] no-underline disabled:text-[var(--grey)] [-webkit-tap-highlight-color:transparent]";
type AcceptReply = {
  kind?: "go" | "here" | "signin" | "other-device" | "notice" | "going";
  badge?: PortfolioChoice | null;
  change?: string;
  text?: string;
  next?: string;
  notice?: string | null;
  tokenHash?: string;
  cardId?: string | null;
  pay?: boolean;
  error?: string;
};

/** Another person's portfolios must not stay in this browser once the guest signs in. */
export function clearLocal() {
  dropPendingCardUpserts();
  dropPendingItemUpserts();
  dropPendingNotes();
  const user = useAppStore.getState().user;
  useAppStore.setState({ cards: [], contactItems: [], currentCardIndex: 0, user: { ...user, onboarded: false } });
}

function deviceTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
  } catch {
    return null;
  }
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
  /** This session already holds a pass on this event. */
  holdsPass: boolean;
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
  holdsPass,
  auto,
  ended,
  signInHref,
  then = null,
  poster,
  soldOut = false,
  closed = false,
  placesLeft = null,
  source = "page",
  waitText = null,
}: InviteActionsProps) {
  const router = useRouter();
  const sessionReady = useSessionBootstrap();
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; next: string } | null>(null);
  const [going, setGoing] = useState<{ badge: PortfolioChoice | null; change: string } | null>(null);
  const [signInOffer, setSignInOffer] = useState(false);
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

  const enterPass = async (cardId: string | null | undefined, pay = false) => {
    await hydrateCardsFromServer();
    const state = useAppStore.getState();
    const index = cardId ? state.cards.findIndex((card) => card.id === cardId) : -1;
    if (index >= 0) state.setCurrentCardIndex(index);
    if (then === "wallet" && cardId && (await openWalletPass(`/api/cards/${encodeURIComponent(cardId)}/pass`))) return;
    router.replace(pay ? `/e/${encodeURIComponent(lookup)}/pay` : then && then !== "wallet" ? then : "/main");
  };

  const fail = (text: string) => {
    setHint(text);
    setBusy(false);
  };

  /** One reply shape from the personal link and the open link. */
  const follow = async (send: () => Promise<Response>) => {
    const supabase = createBrowserSupabaseClient();
    let response = await send();
    if (response.status === 401) {
      await supabase.auth.signInAnonymously();
      response = await send();
    }
    const reply = (await response.json()) as AcceptReply;
    if (!response.ok || !reply.kind) return fail(reply.error ?? "Could not open your pass.");
    if (reply.kind === "other-device") {
      setSignInOffer(true);
      return fail("This pass was started in another browser. Sign in with your email to open it here.");
    }
    if (reply.kind === "notice") return fail(reply.text ?? "");
    if (reply.kind === "going") {
      setGoing({ badge: reply.badge ?? null, change: reply.change ?? joinPath });
      setBusy(false);
      return;
    }
    if (reply.kind === "go" && reply.next) {
      if (reply.notice) {
        setNotice({ text: reply.notice, next: reply.next });
        return;
      }
      window.location.assign(reply.next);
      return;
    }
    if (reply.kind === "signin" && reply.tokenHash) {
      clearLocal();
      const signed = await supabase.auth.verifyOtp({ token_hash: reply.tokenHash, type: "magiclink" });
      if (signed.error) return fail("Could not open your pass.");
    }
    await enterPass(reply.cardId, reply.pay === true);
  };

  const acceptToken = async () => {
    if (busy || !token) return;
    setBusy(true);
    setHint(null);
    try {
      await follow(() =>
        fetch(`${base}/guest-accept`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, timeZone: deviceTimeZone(), source }),
        }),
      );
    } catch {
      fail("Could not open your pass.");
    }
  };

  const joinOwn = async () => {
    if (busy) return;
    setBusy(true);
    setHint(null);
    try {
      const response = await fetch(`${base}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
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

  const createPass = () => {
    if (token) return void acceptToken();
    if (holdsPass) return void enterPass(null);
  };

  const primary = permanent ? (token ? acceptToken : joinOwn) : acceptToken;
  const primaryRef = useRef(primary);
  useEffect(() => {
    primaryRef.current = primary;
  });
  useEffect(() => {
    if (!auto || !token || !sessionReady || autoRan.current) return;
    autoRan.current = true;
    void primaryRef.current();
  }, [auto, token, sessionReady]);

  const toast = notice ? (
    <SkyToast
      key={notice.text}
      text={notice.text}
      onDone={() => {
        const next = notice.next;
        setNotice(null);
        window.location.assign(next);
      }}
    />
  ) : null;

  const offer = signInOffer ? (
    <Link
      href={signInHref}
      className="press mt-4 inline-block t-caps text-[var(--grey)] no-underline [-webkit-tap-highlight-color:transparent]"
    >
      Sign in
    </Link>
  ) : null;

  if (going) {
    return (
      <>
        {poster}
        <div className="mt-8 flex flex-col items-center">
          <p className="m-0 bg-sky px-[21.6px] py-[10.8px] text-center t-caps text-[var(--ink)]">You&apos;re going ✓</p>
          <div className="mt-6 flex w-full max-w-[280px] min-w-0 items-center" style={{ gap: COLUMN_GAP_PX }}>
            {going.badge ? <PortfolioFace portfolio={going.badge} selected /> : <span className="min-w-0 flex-1" />}
            <Link
              href={going.change}
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
        {offer}
        {toast}
      </>
    );
  }

  const shut = (closed && !token) || (soldOut && !token && !holdsPass);
  const createHref = `/e/${encodeURIComponent(lookup)}/create${token ? `?g=${encodeURIComponent(token)}` : ""}`;
  const createFlow = !shut && !permanent && !holdsPass;

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
        ) : soldOut && !token && !holdsPass ? (
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
            <TapButton disabled={busy || !sessionReady} onTap={() => void primary()} className={SKY}>
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
        ) : (
          <TapButton disabled={busy || !sessionReady} onTap={createPass} className={SKY}>
            Open my pass
          </TapButton>
        )}
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
        {offer}
      </div>
      {toast}
    </>
  );
}

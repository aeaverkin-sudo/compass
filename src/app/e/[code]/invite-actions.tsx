"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Rule } from "@/shared/components/rule";
import { SkyToast } from "@/shared/components/sky-toast";
import { Zone } from "@/shared/components/zone";
import { useSessionBootstrap } from "@/shared/hooks/use-session-bootstrap";
import { createBrowserSupabaseClient } from "@/shared/lib/supabase/browser";
import { dropPendingItemUpserts } from "@/shared/services/card-items-sync";
import { dropPendingCardUpserts, hydrateCardsFromServer } from "@/shared/services/card-sync";
import { dropPendingNotes } from "@/shared/services/notes-sync";
import { useAppStore } from "@/shared/store/app-store";
import { COLUMN_GAP_PX } from "@/shared/layout/axes";
import type { PortfolioChoice } from "@/shared/services/event-registration";
import { PortfolioFace } from "@/shared/components/portfolio-face";

const SKY =
  "press inline-block border-0 bg-sky px-[21.6px] py-[10.8px] text-center t-caps text-[var(--ink)] no-underline disabled:text-[var(--grey)] [-webkit-tap-highlight-color:transparent]";
const FIELD =
  "compass-input block w-full border-0 bg-transparent p-0 t-body text-[var(--ink)] caret-[var(--ink)] outline-none placeholder:text-[var(--placeholder)]";

type AcceptReply = {
  kind?: "go" | "here" | "signin" | "other-device" | "notice" | "going";
  badge?: PortfolioChoice | null;
  change?: string;
  text?: string;
  next?: string;
  notice?: string | null;
  tokenHash?: string;
  cardId?: string | null;
  confirmEmail?: string | null;
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
  /** Where the pass goes once it is open, instead of the card. */
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
  const [form, setForm] = useState(false);
  const [going, setGoing] = useState<{ badge: PortfolioChoice | null; change: string } | null>(null);
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [website, setWebsite] = useState("");
  const opened = useRef(false);
  const autoRan = useRef(false);
  const nameRef = useRef<HTMLInputElement>(null);
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
    router.replace(pay ? `/e/${encodeURIComponent(lookup)}/pay` : (then ?? "/main"));
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
    if (reply.kind === "other-device") return fail("Open this link on the phone you used first");
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
    if (reply.confirmEmail) {
      await supabase.auth
        .updateUser({ email: reply.confirmEmail }, { emailRedirectTo: `${window.location.origin}/main` })
        .catch(() => undefined);
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

  const submitOpen = async () => {
    if (busy) return;
    if (!name.trim()) return fail("Add your name.");
    if (!contact.trim()) return fail("Add your email or phone.");
    setBusy(true);
    setHint(null);
    try {
      await follow(() =>
        fetch(`${base}/pass`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, contact, website, timeZone: deviceTimeZone() }),
        }),
      );
    } catch {
      fail("Could not open your pass.");
    }
  };

  const createPass = () => {
    if (token) return void acceptToken();
    if (holdsPass) return void enterPass(null);
    setHint(null);
    setForm(true);
    window.setTimeout(() => nameRef.current?.focus(), 0);
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

  if (form) {
    return (
      <>
        <div className="mx-auto w-[62%]">{poster}</div>
        <form
          className="mt-6 w-full"
          onSubmit={(event) => {
            event.preventDefault();
            void submitOpen();
          }}
        >
          <Rule />
          <Zone label="Name" rule>
            <input
              ref={nameRef}
              type="text"
              autoComplete="name"
              aria-label="Name"
              placeholder="Name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className={FIELD}
            />
          </Zone>
          <Zone label="Email or phone" rule>
            <input
              type="text"
              inputMode="email"
              autoCapitalize="none"
              autoComplete="email"
              aria-label="Email or phone"
              placeholder="name@mail.com"
              value={contact}
              onChange={(event) => setContact(event.target.value)}
              className={FIELD}
            />
          </Zone>
          <input
            type="text"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden
            value={website}
            onChange={(event) => setWebsite(event.target.value)}
            className="pointer-events-none absolute -left-[9999px] h-px w-px opacity-0"
          />
          <div className="mt-6 flex flex-col items-center">
            <button type="submit" disabled={busy || !sessionReady} className={SKY}>
              Continue
            </button>
            {placesLeft != null ? (
              <p className="mt-3 mb-0 text-center t-meta text-[var(--grey)]">{`${placesLeft} ${placesLeft === 1 ? "place" : "places"} left`}</p>
            ) : null}
            <Footnote openLink />
            {hint ? <p className="mt-3 mb-0 text-center t-meta text-[var(--ink)]">{hint}</p> : null}
          </div>
        </form>
        {toast}
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
        {toast}
      </>
    );
  }

  const shut = (closed && !token) || (soldOut && !token && !holdsPass);

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
            <button type="button" disabled={busy || !sessionReady} onClick={() => void primary()} className={SKY}>
              I&apos;m going *
            </button>
          </>
        ) : (
          <>
            <button type="button" disabled={busy || !sessionReady} onClick={createPass} className={SKY}>
              I&apos;m going
              <br />
              Create my pass *
            </button>
            {token ? (
              <p className="mt-3 mb-0 text-center t-meta text-[var(--grey)]">
                This link is your pass — don&apos;t forward it.
              </p>
            ) : null}
          </>
        )}
        {closed && !token ? null : <Footnote openLink={!token} />}
        {permanent || shut ? null : (
          <p className="mt-3 mb-0 text-center t-meta text-[var(--grey)]">
            Already have an account?{" "}
            <Link href={signInHref} className="text-[var(--grey)] underline">
              Sign in
            </Link>
          </p>
        )}
        {hint ? <p className="mt-3 mb-0 text-center t-meta text-[var(--ink)]">{hint}</p> : null}
      </div>
      {toast}
    </>
  );
}

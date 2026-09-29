"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ConsentLine } from "@/shared/components/consent-line";
import { createBrowserSupabaseClient } from "@/shared/lib/supabase/browser";
import { markRegisteredDevice } from "@/shared/lib/registered-device";
import { ignoreNextSignedOut } from "@/shared/lib/session-bootstrap";
import { dropPendingItemUpserts } from "@/shared/services/card-items-sync";
import { dropPendingCardUpserts, hydrateCardsFromServer } from "@/shared/services/card-sync";
import { recordConsent } from "@/shared/services/consent-client";
import { dropPendingNotes } from "@/shared/services/notes-sync";
import { useAppStore } from "@/shared/store/app-store";

type Branch = "email" | "code" | "login";

function deviceHasCard(cards: { displayName: string; photoAttachmentId?: string; photo?: string }[]) {
  return cards.some((card) => card.displayName.trim() || card.photoAttachmentId || card.photo);
}

function rememberLocal() {
  const state = useAppStore.getState();
  return {
    cards: state.cards,
    contactItems: state.contactItems,
    currentCardIndex: state.currentCardIndex,
  };
}

function clearLocal() {
  const user = useAppStore.getState().user;
  useAppStore.setState({
    cards: [],
    contactItems: [],
    currentCardIndex: 0,
    user: { ...user, onboarded: true },
  });
}

/**
 * Signing into an account that already exists leaves the trial card where it is.
 * `redirects` is Google: the browser leaves before the new session exists, so the
 * local card is cleared first and the next page loads the existing account.
 */
async function enterExistingAccount(signIn: () => Promise<string | null>, redirects = false) {
  dropPendingCardUpserts();
  dropPendingItemUpserts();
  dropPendingNotes();
  const snapshot = rememberLocal();
  clearLocal();
  const error = await signIn();
  if (error) {
    useAppStore.setState(snapshot);
    return error;
  }
  if (!redirects) {
    markRegisteredDevice();
    await hydrateCardsFromServer();
  }
  return null;
}

export function RegisterScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const taken = params.get("taken") === "1";
  const [accepted, setAccepted] = useState(false);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [branch, setBranch] = useState<Branch>("email");
  const [serverHasCard, setServerHasCard] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(
    params.get("expired") === "1" ? "Session expired. Sign in." : params.get("error"),
  );
  const cards = useAppStore((state) => state.cards);

  const hasCard = serverHasCard || deviceHasCard(cards);
  const mergeWarning = hasCard
    ? "This device already has a portfolio. Signing in will not merge it into the existing account."
    : null;

  const requireConsent = () => {
    if (accepted) return true;
    setMessage("Turn on the agreement first.");
    return false;
  };

  const continueWithGoogle = async () => {
    if (!requireConsent() || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      await recordConsent("register");
      const supabase = createBrowserSupabaseClient();
      const { error } = await supabase.auth.linkIdentity({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error) setMessage(error.message);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not start Google");
    } finally {
      setBusy(false);
    }
  };

  const signInExistingGoogle = async () => {
    if (!requireConsent() || busy) return;
    setBusy(true);
    setMessage(null);
    const error = await enterExistingAccount(async () => {
      const supabase = createBrowserSupabaseClient();
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      });
      return oauthError?.message ?? null;
    }, true);
    if (error) {
      setMessage(error);
      setBusy(false);
    }
  };

  const submitEmail = async () => {
    if (!requireConsent() || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      await recordConsent("register");
      const response = await fetch("/api/auth/email/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const body = (await response.json()) as { mode?: string; hasCard?: boolean; error?: string };
      if (!response.ok) {
        setMessage(body.error ?? "Could not continue");
        return;
      }
      if (body.mode === "done") {
        router.push("/main");
        return;
      }
      if (body.mode === "login") {
        setServerHasCard(Boolean(body.hasCard));
        setBranch("login");
        return;
      }
      setBranch("code");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not continue");
    } finally {
      setBusy(false);
    }
  };

  const submitCode = async () => {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/auth/email/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code }),
      });
      const body = (await response.json()) as { mode?: string; hasCard?: boolean; error?: string };
      if (!response.ok) {
        setMessage(body.error ?? "Could not check the code");
        return;
      }
      if (body.mode === "login") {
        setServerHasCard(Boolean(body.hasCard));
        setBranch("login");
        setMessage("This email already has an account.");
        return;
      }
      const supabase = createBrowserSupabaseClient();
      ignoreNextSignedOut();
      await supabase.auth.signOut({ scope: "local" });
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: code.trim(),
      });
      if (error || !data.session) {
        setBranch("login");
        setPassword(code.trim());
        setMessage("The code is your password. Sign in with it.");
        return;
      }
      markRegisteredDevice();
      router.push("/main");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not check the code");
    } finally {
      setBusy(false);
    }
  };

  const submitPassword = async () => {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    const error = await enterExistingAccount(async () => {
      const supabase = createBrowserSupabaseClient();
      const { error: signError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: password,
      });
      return signError?.message ?? null;
    });
    setBusy(false);
    if (error) {
      setMessage(error);
      return;
    }
    router.push("/main");
  };

  const forgotPassword = async () => {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/auth/email/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        setMessage(body.error ?? "Could not send the link");
        return;
      }
      setMessage("If this email has an account, a reset link is on its way.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not send the link");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="compass-main flex min-h-lvh flex-col bg-white px-8 py-12 text-[#111]">
      <h1 className="text-[32px] font-light leading-tight">{branch === "login" ? "Sign in" : "Register"}</h1>
      <p className="mt-3 max-w-xs text-[14px] font-light leading-snug">
        {branch === "login"
          ? "Enter the email and the password for this account."
          : "Google, or an email. A new email gets a code. That code is the password."}
      </p>
      {branch === "login" ? (
        <button
          type="button"
          className="mt-6 self-start text-[14px] font-light underline"
          onClick={() => {
            setBranch("email");
            setMessage(null);
          }}
        >
          Create an account
        </button>
      ) : (
        <button
          type="button"
          className="mt-6 self-start text-[14px] font-light underline"
          onClick={() => {
            setBranch("login");
            setMessage(null);
          }}
        >
          Already have an account? Sign in
        </button>
      )}

      <div className="mt-8">
        <ConsentLine checked={accepted} onCheckedChange={setAccepted} id="register-consent" />
      </div>

      {taken ? (
        <div className="mt-2 max-w-xs">
          <p className="text-[14px] font-light leading-snug">This Google account already has a profile.</p>
          {mergeWarning ? <p className="mt-2 text-[14px] font-normal leading-snug">{mergeWarning}</p> : null}
          <button
            type="button"
            disabled={busy || !accepted}
            onClick={() => void signInExistingGoogle()}
            className="mt-4 text-[14px] font-normal underline disabled:opacity-40"
          >
            {hasCard ? "Sign in with Google without merging" : "Sign in with Google"}
          </button>
        </div>
      ) : (
        <button
          type="button"
          disabled={busy || !accepted}
          onClick={() => void continueWithGoogle()}
          className="mt-2 min-w-[160px] self-start border-0 bg-sky px-6 py-3 text-[13px] font-normal tracking-[0.14em] uppercase"
        >
          Continue with Google
        </button>
      )}

      <form
        className="mt-10 flex max-w-xs flex-col"
        onSubmit={(event) => {
          event.preventDefault();
          if (branch === "email") void submitEmail();
          if (branch === "code") void submitCode();
          if (branch === "login") void submitPassword();
        }}
      >
        <label className="text-[12px] font-normal tracking-[0.08em] uppercase" htmlFor="register-email">
          Email
        </label>
        <input
          id="register-email"
          type="email"
          autoCapitalize="none"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          disabled={branch === "code"}
          className="mt-2 border-b border-[#111] bg-transparent py-2 text-[16px] font-light outline-none disabled:opacity-60"
        />

        {branch === "code" ? (
          <>
            <p className="mt-4 text-[14px] font-light leading-snug">
              We sent a code. It is your password. Enter it to finish.
            </p>
            <label className="mt-4 text-[12px] font-normal tracking-[0.08em] uppercase" htmlFor="register-code">
              Code
            </label>
            <input
              id="register-code"
              inputMode="text"
              autoCapitalize="characters"
              autoComplete="one-time-code"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              className="mt-2 border-b border-[#111] bg-transparent py-2 text-[16px] font-light tracking-[0.2em] outline-none"
            />
          </>
        ) : null}

        {branch === "login" ? (
          <>
            <p className="mt-4 text-[14px] font-light leading-snug">
              This email already has an account. Enter the starter code, or the password you changed it to.
            </p>
            {mergeWarning ? <p className="mt-2 text-[14px] font-normal leading-snug">{mergeWarning}</p> : null}
            <label className="mt-4 text-[12px] font-normal tracking-[0.08em] uppercase" htmlFor="register-password">
              Password
            </label>
            <input
              id="register-password"
              type="password"
              autoCapitalize="none"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-2 border-b border-[#111] bg-transparent py-2 text-[16px] font-light outline-none"
            />
            <button
              type="button"
              disabled={busy}
              onClick={() => void forgotPassword()}
              className="mt-3 self-start text-[13px] font-light underline"
            >
              Forgot password
            </button>
          </>
        ) : null}

        <button
          type="submit"
          disabled={busy || !accepted}
          className="mt-6 min-w-[160px] self-start border-0 bg-sky px-6 py-3 text-[13px] font-normal tracking-[0.14em] uppercase"
        >
          {branch === "login" ? (hasCard ? "Sign in without merging" : "Sign in") : "Continue"}
        </button>
      </form>

      {message ? <p className="mt-6 max-w-xs text-[13px] font-light leading-snug">{message}</p> : null}
    </main>
  );
}

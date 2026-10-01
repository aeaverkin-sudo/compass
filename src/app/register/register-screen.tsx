"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { BackButton } from "@/shared/components/back-button";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { isInAppBrowser } from "@/shared/lib/in-app-browser";
import { createBrowserSupabaseClient } from "@/shared/lib/supabase/browser";
import { markRegisteredDevice } from "@/shared/lib/registered-device";
import { ignoreNextSignedOut } from "@/shared/lib/session-bootstrap";
import { dropPendingItemUpserts } from "@/shared/services/card-items-sync";
import { dropPendingCardUpserts, hydrateCardsFromServer } from "@/shared/services/card-sync";
import { recordConsent } from "@/shared/services/consent-client";
import { dropPendingNotes } from "@/shared/services/notes-sync";
import { SUPPORT_EMAIL } from "@/shared/lib/app-info";
import { useAppStore } from "@/shared/store/app-store";

/** Only the save flow may pull the person back. Anything else opens the main screen. */
function afterAuthPath(next: string | null) {
  if (next && next.startsWith("/save/") && !next.includes("//") && !next.includes("\\")) return next;
  return "/main";
}

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

const IN_APP_HINT = "Google sign-in works in Safari or Chrome. Open this page there, or use email below.";
const FORGOT_EMAIL = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("Can't find my ADED email")}`;
const LINK_LINE = {
  textDecoration: "underline",
  textDecorationColor: "rgba(17,17,17,0.45)",
  textDecorationThickness: "0.5px",
  textUnderlineOffset: "3px",
} as const;

function signInHref(nextPath: string, error?: string) {
  const query = new URLSearchParams();
  query.set("signin", "1");
  if (nextPath.startsWith("/save/")) query.set("next", nextPath);
  if (error) query.set("error", error);
  return `/register?${query.toString()}`;
}

export function RegisterScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const signinOnly = params.get("signin") === "1";
  const taken = params.get("taken") === "1";
  const [inApp, setInApp] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(
    params.get("expired") === "1" ? "Session expired. Sign in." : params.get("error"),
  );
  const [emailStep, setEmailStep] = useState<"hidden" | "email" | "code">("hidden");
  const [dimConsent, setDimConsent] = useState(false);
  const cards = useAppStore((state) => state.cards);
  const emailRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  const consentSaved = useRef(false);
  const blinkTimers = useRef<number[]>([]);

  useEffect(() => {
    setInApp(isInAppBrowser());
  }, []);

  const hasCard = deviceHasCard(cards);
  const nextPath = afterAuthPath(params.get("next"));
  const registerHref = nextPath.startsWith("/save/")
    ? `/register?next=${encodeURIComponent(nextPath)}`
    : "/register";
  const googleRedirect = () => `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`;
  const mergeWarning = hasCard
    ? "This device already has a portfolio. Signing in will not merge it into the existing account."
    : null;

  const blinkConsent = () => {
    blinkTimers.current.forEach((id) => window.clearTimeout(id));
    const frames = [true, false, true, false];
    blinkTimers.current = frames.map((dim, index) =>
      window.setTimeout(() => setDimConsent(dim), index * 150),
    );
  };

  useEffect(() => {
    return () => blinkTimers.current.forEach((id) => window.clearTimeout(id));
  }, []);

  const ensureConsent = async () => {
    if (consentSaved.current) return;
    await recordConsent("register");
    consentSaved.current = true;
  };

  const agree = (on: boolean) => {
    setAccepted(on);
    if (!on) return;
    void ensureConsent().catch((error) => {
      setMessage(error instanceof Error ? error.message : "Could not save agreement");
    });
  };

  const gate = () => {
    if (accepted) return true;
    blinkConsent();
    return false;
  };

  const continueWithGoogle = async () => {
    if (!gate() || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      await ensureConsent();
      const supabase = createBrowserSupabaseClient();
      const { error } = await supabase.auth.linkIdentity({
        provider: "google",
        options: { redirectTo: googleRedirect() },
      });
      if (error) setMessage(error.message);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not start Google");
    } finally {
      setBusy(false);
    }
  };

  const signInExistingGoogle = async () => {
    if (busy) return;
    if (!signinOnly && !gate()) return;
    setBusy(true);
    setMessage(null);
    const error = await enterExistingAccount(async () => {
      const supabase = createBrowserSupabaseClient();
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: googleRedirect() },
      });
      return oauthError?.message ?? null;
    }, true);
    if (error) {
      setMessage(error);
      setBusy(false);
    }
  };

  const submitEmail = async () => {
    if (!gate() || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      await ensureConsent();
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
        router.push(nextPath);
        return;
      }
      if (body.mode === "login") {
        router.push(signInHref(nextPath, "This email already has an account."));
        return;
      }
      setEmailStep("code");
      window.setTimeout(() => codeRef.current?.focus(), 0);
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
        router.push(signInHref(nextPath, "This email already has an account."));
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
        router.push(signInHref(nextPath, "The code is your password. Sign in with it."));
        return;
      }
      markRegisteredDevice();
      router.push(nextPath);
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
    router.push(nextPath);
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

  if (signinOnly) {
    return (
      <main className="compass-main flex h-dvh flex-col overflow-y-auto bg-white px-8 pt-[84px] pb-12 text-[#111]">
        <BackButton fallbackHref="/" />
        <h1 className="text-[32px] font-light leading-tight">Sign in</h1>
        <p className="mt-3 max-w-xs text-[14px] font-light leading-snug">
          Enter your email and password, or use Google.
        </p>
        {inApp ? (
          <p className="mt-6 max-w-xs text-[14px] font-light leading-snug">{IN_APP_HINT}</p>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => void signInExistingGoogle()}
            className="mt-6 min-w-[160px] self-start border-0 bg-sky px-6 py-3 text-[13px] font-normal tracking-[0.14em] uppercase"
          >
            Sign in with Google
          </button>
        )}
        <form
          className="mt-10 flex max-w-xs flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            void submitPassword();
          }}
        >
          <label className="text-[12px] font-normal tracking-[0.08em] uppercase" htmlFor="signin-email">
            Email
          </label>
          <input
            id="signin-email"
            type="email"
            autoCapitalize="none"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="mt-2 border-b border-[#111] bg-transparent py-2 text-[16px] font-light outline-none"
          />
          <label className="mt-4 text-[12px] font-normal tracking-[0.08em] uppercase" htmlFor="signin-password">
            Password
          </label>
          <input
            id="signin-password"
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
          <a href={FORGOT_EMAIL} className="mt-3 self-start text-[13px] font-light underline">
            Forgot your email?
          </a>
          <button
            type="submit"
            disabled={busy}
            className="mt-6 min-w-[160px] self-start border-0 bg-sky px-6 py-3 text-[13px] font-normal tracking-[0.14em] uppercase"
          >
            Sign in
          </button>
        </form>
        {message ? <p className="mt-6 max-w-xs text-[13px] font-light leading-snug">{message}</p> : null}
        <Link href={registerHref} className="mt-10 self-start text-[14px] font-light underline">
          New here? Get your portfolio
        </Link>
      </main>
    );
  }

  const openEmail = () => {
    if (!gate()) return;
    setMessage(null);
    setEmailStep("email");
    window.setTimeout(() => emailRef.current?.focus(), 0);
  };

  const leaveEmailStep = () => {
    setMessage(null);
    if (emailStep === "code") {
      setEmailStep("email");
      window.setTimeout(() => emailRef.current?.focus(), 0);
      return;
    }
    setEmailStep("hidden");
  };

  if (emailStep !== "hidden") {
    const onCode = emailStep === "code";
    return (
      <main className="compass-main h-dvh overflow-y-auto bg-white px-8 pb-[max(2.5rem,env(safe-area-inset-bottom))] text-[#111]">
        <BackButton fallbackHref="/" onBack={leaveEmailStep} />
        <div className="mt-10 mb-[18px] grid h-[22px] grid-cols-[44px_minmax(0,1fr)_44px] items-center">
          <span aria-hidden className="size-[22px]" />
          <h1 className="text-center text-[13px] leading-none font-normal tracking-[0.2em] text-[#111] uppercase">
            Registration
          </h1>
        </div>
        <form
          className="mt-8"
          onSubmit={(event) => {
            event.preventDefault();
            if (onCode) void submitCode();
            else void submitEmail();
          }}
        >
          <label className="text-[12px] font-normal tracking-[0.08em] text-[#999] uppercase" htmlFor="register-email-field">
            {onCode ? "Code" : "Email"}
          </label>
          {onCode ? (
            <input
              id="register-email-field"
              ref={codeRef}
              inputMode="text"
              autoCapitalize="characters"
              autoComplete="one-time-code"
              aria-label="Code"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="Code"
              className="mt-2 w-full border-b-[0.5px] border-[#111] bg-transparent py-2 text-[16px] font-normal tracking-[0.2em] text-[#111] caret-[#111] outline-none placeholder:tracking-normal placeholder:text-[#999]"
            />
          ) : (
            <input
              id="register-email-field"
              ref={emailRef}
              type="email"
              autoCapitalize="none"
              autoComplete="email"
              aria-label="Email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="Email"
              className="mt-2 w-full border-b-[0.5px] border-[#111] bg-transparent py-2 text-[16px] font-normal tracking-[-0.015em] text-[#111] caret-[#111] outline-none placeholder:text-[#999]"
            />
          )}
          <p className="mt-3 text-[13px] leading-[1.45] font-normal text-[#999]">
            {onCode
              ? `Sent to ${email.trim()}. This code is your password.`
              : "We'll email a one-time code to this address. The code becomes your password."}
          </p>
          <button
            type="submit"
            disabled={busy || (onCode ? code.trim() === "" : email.trim() === "")}
            className="mt-8 border-0 bg-sky px-6 py-3 text-[13px] font-normal tracking-[0.14em] text-[#111] uppercase shadow-none disabled:opacity-40 [-webkit-tap-highlight-color:transparent]"
          >
            Continue
          </button>
          {onCode ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void submitEmail()}
              className="mt-10 block text-[13px] font-normal text-[#111] underline decoration-[0.5px] underline-offset-[3px] disabled:opacity-40 [-webkit-tap-highlight-color:transparent]"
              style={{ textDecorationColor: "rgba(17,17,17,0.4)" }}
            >
              Resend code
            </button>
          ) : null}
        </form>
        {message ? <p className="mt-6 max-w-xs text-[13px] font-light leading-snug text-[#111]">{message}</p> : null}
      </main>
    );
  }

  const ink = accepted ? "#111" : "#bdbdbd";
  const rule = accepted ? "#d7d7d7" : "#bdbdbd";

  return (
    <main className="compass-main h-dvh overflow-y-auto bg-white px-8 pb-[max(2.5rem,env(safe-area-inset-bottom))] text-[#111]">
      <BackButton fallbackHref="/" />
      <div className="mt-10 mb-[18px] grid h-[22px] grid-cols-[44px_minmax(0,1fr)_44px] items-center">
        <span aria-hidden className="size-[22px]" />
        <h1 className="text-center text-[13px] leading-none font-normal tracking-[0.2em] text-[#111] uppercase">
          Registration
        </h1>
      </div>

      <div className="mt-8">
        {inApp ? (
          <p className="px-2 py-4 text-center text-[14px] leading-snug font-light text-[#111]">{IN_APP_HINT}</p>
        ) : (
          <button
            type="button"
            onClick={() => void (taken ? signInExistingGoogle() : continueWithGoogle())}
            className="flex min-h-11 w-full items-center justify-center px-2 py-4 text-center text-[15px] leading-[1.3] font-normal tracking-[0.14em] uppercase transition-colors duration-200 [-webkit-tap-highlight-color:transparent]"
            style={{ color: ink }}
          >
            Google registration
          </button>
        )}
        {taken && !inApp ? (
          <p className="px-2 pb-3 text-center text-[13px] leading-[1.45] font-normal text-[#111]">
            This Google account already has a profile.
            {mergeWarning ? ` ${mergeWarning}` : ""}
          </p>
        ) : null}
        <div className="border-t-[0.5px] transition-colors duration-200" style={{ borderColor: rule }} />

        <button
          type="button"
          onClick={openEmail}
          className="flex min-h-11 w-full items-center justify-center px-2 py-4 text-center text-[15px] leading-[1.3] font-normal tracking-[0.14em] uppercase transition-colors duration-200 [-webkit-tap-highlight-color:transparent]"
          style={{ color: ink }}
        >
          Email registration
        </button>
        <div className="border-t-[0.5px] transition-colors duration-200" style={{ borderColor: rule }} />

        <button
          type="button"
          onClick={() => {
            if (!gate()) return;
            router.push("/try");
          }}
          className="flex min-h-11 w-full items-center justify-center px-2 py-4 text-center text-[15px] leading-[1.3] font-normal tracking-[0.14em] uppercase transition-colors duration-200 [-webkit-tap-highlight-color:transparent]"
          style={{ color: ink }}
        >
          Try without registration
        </button>
        <div className="border-t-[0.5px] transition-colors duration-200" style={{ borderColor: rule }} />
      </div>

      <div className="mt-8 flex items-start gap-3">
        <span className={dimConsent ? "opacity-20" : "opacity-100"} style={{ transition: "opacity 150ms linear" }}>
          <Checkbox
            id="register-consent"
            checked={accepted}
            onCheckedChange={(value) => agree(value === true)}
            aria-label="I agree to the Terms & Conditions and Privacy Policy."
            className="size-5 rounded-none border-[1.3px] border-[#111] bg-transparent"
            style={{ backgroundColor: accepted ? "var(--sky)" : undefined }}
          />
        </span>
        <p
          className="text-[13px] leading-[1.45] font-normal text-[#555]"
          onClick={(event) => {
            if ((event.target as HTMLElement).closest("a")) return;
            agree(!accepted);
          }}
        >
          I agree to the <Link href="/terms" style={LINK_LINE}>Terms & Conditions</Link> and{" "}
          <Link href="/privacy" style={LINK_LINE}>Privacy Policy</Link>.
        </p>
      </div>
      {message ? <p className="mt-6 max-w-xs text-[13px] font-light leading-snug">{message}</p> : null}
    </main>
  );
}

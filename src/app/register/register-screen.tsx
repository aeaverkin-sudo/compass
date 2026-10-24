"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { AuthModeToggle } from "@/shared/components/auth-mode-toggle";
import { BackButton } from "@/shared/components/back-button";
import { ScreenHeader } from "@/shared/components/screen-header";
import { Rule } from "@/shared/components/rule";
import { Zone } from "@/shared/components/zone";
import { HEADER_ROW_PX, VALUE_AXIS_PX } from "@/shared/layout/axes";
import { SCREEN_TOP_AXIS_PX } from "@main/layout";
import { questionnaireHref } from "@/app/create/door";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { createBrowserSupabaseClient } from "@/shared/lib/supabase/browser";
import { markRegisteredDevice } from "@/shared/lib/registered-device";
import { clearRegistrationRequired, ignoreNextSignedOut } from "@/shared/lib/session-bootstrap";
import { dropPendingItemUpserts } from "@/shared/services/card-items-sync";
import { dropPendingCardUpserts, hydrateCardsFromServer } from "@/shared/services/card-sync";
import { recordConsent } from "@/shared/services/consent-client";
import { dropPendingNotes } from "@/shared/services/notes-sync";
import { isEventInvitePath, isEventJoinPath, isEventTeamPath } from "@/shared/event/lookup";
import { SUPPORT_EMAIL } from "@/shared/lib/app-info";
import { useAppStore } from "@/shared/store/app-store";

/** A card save, an event invite or join, or a manager invite may pull the person back. Anything else opens the main screen. */
function afterAuthPath(next: string | null) {
  if (next && next.startsWith("/save/") && !next.includes("//") && !next.includes("\\")) return next;
  if (next && (isEventJoinPath(next) || isEventTeamPath(next) || isEventInvitePath(next))) return next;
  return "/main";
}

function keepsNext(path: string) {
  return path.startsWith("/save/") || isEventJoinPath(path) || isEventTeamPath(path) || isEventInvitePath(path);
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

/** Password sign-in clears the trial first and puts it back if the password is wrong. */
async function enterExistingAccount(signIn: () => Promise<string | null>) {
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
  markRegisteredDevice();
  clearRegistrationRequired();
  await hydrateCardsFromServer();
  return null;
}

const FORGOT_EMAIL = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("Can't find my ADED email")}`;
const LINK_LINE = {
  textDecoration: "underline",
  textDecorationColor: "rgba(17,17,17,0.45)",
  textDecorationThickness: "0.5px",
  textUnderlineOffset: "3px",
} as const;
/** One action in a zone: text on A1, left aligned, 44px tap row, no rule of its own. */
const CHOICE =
  "press flex min-h-11 w-full items-center text-left t-caps transition-colors duration-200 [-webkit-tap-highlight-color:transparent]";
/** Field inside a zone: no underline. The rule between zones is the only line. */
const FIELD =
  "compass-input block w-full border-0 bg-transparent p-0 t-body text-[var(--ink)] caret-[var(--ink)] outline-none placeholder:text-[var(--placeholder)]";
/** Primary action: sky block on A1. Disabled keeps the sky and greys the text. */
const PRIMARY =
  "press border-0 bg-sky px-6 py-3 t-caps text-[var(--ink)] shadow-none disabled:text-[var(--grey)] [-webkit-tap-highlight-color:transparent]";
const UNDERLINE = "underline decoration-[0.5px] underline-offset-[3px]";

function Message({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <p className="mt-6 max-w-xs t-meta text-[var(--ink)]" style={{ marginLeft: VALUE_AXIS_PX }}>
      {text}
    </p>
  );
}

function signInHref(nextPath: string, error?: string) {
  const query = new URLSearchParams();
  query.set("signin", "1");
  if (keepsNext(nextPath)) query.set("next", nextPath);
  if (error) query.set("error", error);
  return `/register?${query.toString()}`;
}

export function RegisterScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const signinOnly = params.get("signin") === "1";
  const [accepted, setAccepted] = useState(false);
  const emailed = params.get("email")?.trim() ?? "";
  const [email, setEmail] = useState(emailed);
  const [emailLink, setEmailLink] = useState(emailed);
  if (emailed !== emailLink) {
    setEmailLink(emailed);
    if (emailed) setEmail(emailed);
  }
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(
    params.get("expired") === "1" ? "Session expired. Sign in." : params.get("error"),
  );
  const [emailStep, setEmailStep] = useState<"hidden" | "email" | "code">("hidden");
  const [dimConsent, setDimConsent] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  const consentSaved = useRef(false);
  const blinkTimers = useRef<number[]>([]);

  const nextPath = afterAuthPath(params.get("next"));

  useEffect(() => {
    if (!signinOnly) return;
    if (emailed) passwordRef.current?.focus();
    else emailRef.current?.focus();
  }, [signinOnly, emailed]);

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
      clearRegistrationRequired();
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
      ignoreNextSignedOut();
      await supabase.auth.signOut({ scope: "local" });
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
      <main className="compass-main h-dvh overflow-y-auto bg-white px-[var(--gutter)] pb-[max(2.5rem,env(safe-area-inset-bottom))] text-[#111]">
        <BackButton fallbackHref="/" />
        <AuthModeToggle
          mode="in"
          signUpHref={questionnaireHref(params.get("next"), params.get("email"))}
          signInHref="/register?signin=1"
        />
        <div
          aria-hidden
          className="mb-[18px] shrink-0"
          style={{ height: `calc(env(safe-area-inset-top) + ${SCREEN_TOP_AXIS_PX}px - ${HEADER_ROW_PX / 2}px + ${HEADER_ROW_PX}px)` }}
        />
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submitPassword();
          }}
        >
          <Zone label="Email">
            <input
              id="signin-email"
              ref={emailRef}
              type="email"
              autoCapitalize="none"
              autoComplete="email"
              aria-label="Email"
              placeholder="name@mail.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className={FIELD}
            />
          </Zone>
          <Rule />
          <Zone label="Password">
            <span className="flex min-w-0 items-center gap-2">
              <input
                id="signin-password"
                ref={passwordRef}
                type={passwordVisible ? "text" : "password"}
                autoCapitalize="none"
                autoComplete="current-password"
                aria-label="Password"
                placeholder="Password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className={FIELD}
              />
              <button
                type="button"
                aria-label={passwordVisible ? "Hide password" : "Show password"}
                className="shrink-0 border-0 bg-transparent p-0 text-[var(--ink)]"
                onClick={() => setPasswordVisible((current) => !current)}
              >
                {passwordVisible ? <Eye className="size-4" strokeWidth={1.5} /> : <EyeOff className="size-4" strokeWidth={1.5} />}
              </button>
            </span>
            <p className="mt-2 t-meta text-[var(--grey)]">
              Signed up with a code? That code is your password.
            </p>
          </Zone>
          <Rule />
          <Zone label="">
            <button type="submit" disabled={busy} className={`${PRIMARY} w-full`}>
              Sign in
            </button>
            <p className="mt-4 t-meta text-[var(--ink)]">
              <button
                type="button"
                disabled={busy}
                onClick={() => void forgotPassword()}
                className={`${UNDERLINE} disabled:text-[var(--grey)]`}
                style={{ textDecorationColor: "rgba(17,17,17,0.4)" }}
              >
                Forgot password
              </button>
              <span className="text-[#c2c2c2]"> / </span>
              <a href={FORGOT_EMAIL} className={UNDERLINE} style={{ textDecorationColor: "rgba(17,17,17,0.4)" }}>
                Forgot email
              </a>
            </p>
          </Zone>
        </form>
        <Message text={message} />
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
      <main className="compass-main h-dvh overflow-y-auto bg-white px-[var(--gutter)] pb-[max(2.5rem,env(safe-area-inset-bottom))] text-[#111]">
        <ScreenHeader title="Sign up" fallbackHref="/" onBack={leaveEmailStep} />
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (onCode) void submitCode();
            else void submitEmail();
          }}
        >
          <Zone label={onCode ? "Code" : "Email"}>
            {onCode ? (
              <input
                id="register-email-field"
                ref={codeRef}
                inputMode="text"
                autoCapitalize="characters"
                autoComplete="one-time-code"
                aria-label="Code"
                placeholder="Code"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                className={FIELD}
              />
            ) : (
              <input
                id="register-email-field"
                ref={emailRef}
                type="email"
                autoCapitalize="none"
                autoComplete="email"
                aria-label="Email"
                placeholder="name@mail.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className={FIELD}
              />
            )}
            <p className="mt-2 t-meta text-[var(--grey)]">
              {onCode
                ? `Sent to ${email.trim()}. This code is your password. You can change it in your profile.`
                : "We will send you a code. This code is your password. You can change it in your profile."}
            </p>
          </Zone>
          <Rule />
          <Zone label="">
            <button
              type="submit"
              disabled={busy || (onCode ? code.trim() === "" : email.trim() === "")}
              className={PRIMARY}
            >
              Continue
            </button>
            {onCode ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void submitEmail()}
                className={`press mt-6 block t-meta text-[var(--ink)] ${UNDERLINE} disabled:text-[var(--grey)] [-webkit-tap-highlight-color:transparent]`}
                style={{ textDecorationColor: "rgba(17,17,17,0.4)" }}
              >
                Resend code
              </button>
            ) : null}
          </Zone>
        </form>
        <Message text={message} />
      </main>
    );
  }

  const ink = accepted ? "var(--ink)" : "var(--grey)";

  return (
    <main className="compass-main h-dvh overflow-y-auto bg-white px-[var(--gutter)] pb-[max(2.5rem,env(safe-area-inset-bottom))] text-[#111]">
      <ScreenHeader title="Sign up" fallbackHref="/" />
      <Zone label="Sign up">
        <div className="-my-3">
        <button type="button" onClick={openEmail} className={CHOICE} style={{ color: ink }} aria-label="Sign up with email">
          With email
        </button>
        <button
          type="button"
          onClick={() => {
            if (!gate()) return;
            router.push("/try");
          }}
          className={CHOICE}
          style={{ color: ink }}
          aria-label="Try without sign up"
        >
          Try without account
        </button>
        </div>
      </Zone>
      <Rule />
      <Zone
        align="start"
        label={
          <span className={dimConsent ? "opacity-20" : "opacity-100"} style={{ transition: "opacity 150ms linear" }}>
            <Checkbox
              id="register-consent"
              checked={accepted}
              onCheckedChange={(value) => agree(value === true)}
              aria-label="I agree to the Terms & Conditions and Privacy Policy."
              className="mt-px block size-5 shrink-0 rounded-none border-0 p-0 leading-none focus-visible:outline-none"
              style={{ backgroundColor: "var(--sky)" }}
            />
          </span>
        }
      >
        <p
          className="t-meta text-[#555]"
          onClick={(event) => {
            if ((event.target as HTMLElement).closest("a")) return;
            agree(!accepted);
          }}
        >
          I agree to the <Link href="/terms" style={LINK_LINE}>Terms & Conditions</Link> and{" "}
          <Link href="/privacy" style={LINK_LINE}>Privacy Policy</Link>.
        </p>
      </Zone>
      <Rule />
      <Zone label="Account">
        <Link href={signInHref(nextPath)} className="t-caps text-[var(--ink)]">
          Sign in
        </Link>
      </Zone>
      <Message text={message} />
    </main>
  );
}

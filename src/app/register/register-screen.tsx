"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ScreenHeader } from "@/shared/components/screen-header";
import { Rule } from "@/shared/components/rule";
import { Zone } from "@/shared/components/zone";
import { VALUE_AXIS_PX } from "@/shared/layout/axes";
import { createBrowserSupabaseClient } from "@/shared/lib/supabase/browser";
import { markRegisteredDevice } from "@/shared/lib/registered-device";
import { clearRegistrationRequired, ignoreNextSignedOut } from "@/shared/lib/session-bootstrap";
import { dropPendingItemUpserts } from "@/shared/services/card-items-sync";
import { dropPendingCardUpserts, hydrateCardsFromServer } from "@/shared/services/card-sync";
import { dropPendingNotes } from "@/shared/services/notes-sync";
import { isEventInvitePath, isEventJoinPath, isEventTeamPath } from "@/shared/event/lookup";
import { SignupScreen } from "../e/[code]/create/signup-screen";
import { sourceCardToken } from "@/shared/services/source-card";
import { SUPPORT_EMAIL } from "@/shared/lib/app-info";
import { useAppStore } from "@/shared/store/app-store";

/** A card save, an event invite or join, or a manager invite may pull the person back. Anything else opens the main screen. */
function isScanReturn(path: string) {
  return path.startsWith("/scan/card?") && !path.includes("//") && !path.includes("\\");
}

function afterAuthPath(next: string | null) {
  if (next && next.startsWith("/save/") && !next.includes("//") && !next.includes("\\")) return next;
  if (next && isScanReturn(next)) return next;
  if (next && (isEventJoinPath(next) || isEventTeamPath(next) || isEventInvitePath(next))) return next;
  return "/main";
}

function keepsNext(path: string) {
  return path.startsWith("/save/") || isScanReturn(path) || isEventJoinPath(path) || isEventTeamPath(path) || isEventInvitePath(path);
}

/** A successful password sign-in drops whatever was on this device, then loads that account. */
async function enterExistingAccount(signIn: () => Promise<string | null>) {
  const error = await signIn();
  if (error) return error;
  dropPendingCardUpserts();
  dropPendingItemUpserts();
  dropPendingNotes();
  useAppStore.getState().resetApp();
  markRegisteredDevice();
  clearRegistrationRequired();
  const { data } = await createBrowserSupabaseClient().auth.getUser();
  if (data.user && !data.user.is_anonymous) useAppStore.setState({ ownerId: data.user.id });
  await hydrateCardsFromServer();
  return null;
}

const FORGOT_EMAIL = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("Can't find my ADED email")}`;
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

/** Sign up from an event sign-in link stays on that event's one screen. */
function signupEvent(next: string | null): {
  lookup: string;
  guest: { token: string; name: string; email: string } | null;
} | null {
  if (!next) return null;
  if (isEventJoinPath(next)) {
    let lookup = next.split("/").filter(Boolean)[1] ?? "";
    try {
      lookup = decodeURIComponent(lookup);
    } catch {
      return null;
    }
    return lookup ? { lookup, guest: null } : null;
  }
  if (!isEventInvitePath(next)) return null;
  const cut = next.indexOf("?");
  const pathname = cut === -1 ? next : next.slice(0, cut);
  let lookup = pathname.split("/").filter(Boolean)[1] ?? "";
  try {
    lookup = decodeURIComponent(lookup);
  } catch {
    return null;
  }
  const token = cut === -1 ? null : new URLSearchParams(next.slice(cut + 1)).get("g");
  if (!lookup) return null;
  return { lookup, guest: token ? { token, name: "", email: "" } : null };
}

export function RegisterScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const signinOnly = params.get("signin") === "1";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(
    params.get("expired") === "1" ? "Session expired. Sign in." : params.get("error"),
  );
  const emailRef = useRef<HTMLInputElement>(null);

  const nextPath = afterAuthPath(params.get("next"));
  const card = sourceCardToken(params.get("card"));
  const go = (path: string) => {
    router.push(path === "/main" && card ? `/main?card=${encodeURIComponent(card)}` : path);
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
    go(nextPath);
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
    const signUpHref = (() => {
      const query = new URLSearchParams();
      if (keepsNext(nextPath)) query.set("next", nextPath);
      if (card) query.set("card", card);
      const text = query.toString();
      return text ? `/register?${text}` : "/register";
    })();
    return (
      <main className="compass-main h-dvh overflow-y-auto bg-white px-[var(--gutter)] pb-[max(2.5rem,env(safe-area-inset-bottom))] text-[#111]">
        <ScreenHeader title="Sign in" fallbackHref="/" />
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
            <input
              id="signin-password"
              type="password"
              autoCapitalize="none"
              autoComplete="current-password"
              aria-label="Password"
              placeholder="Password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className={FIELD}
            />
          </Zone>
          <Rule />
          <Zone label="">
            <button type="submit" disabled={busy} className={PRIMARY}>
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
        <Rule />
        <Zone label="No account">
          <Link href={signUpHref} className="t-caps text-[var(--ink)]">
            Create portfolio
          </Link>
        </Zone>
        <Message text={message} />
      </main>
    );
  }

  const fromEvent = signupEvent(params.get("next"));
  return (
    <SignupScreen
      sourceToken={card}
      event={fromEvent ? { lookup: fromEvent.lookup } : undefined}
      guest={fromEvent?.guest}
      next={params.get("next") ?? ""}
    />
  );
}


"use client";

import { useState } from "react";
import { Rule } from "@/shared/components/rule";
import { ScreenHeader } from "@/shared/components/screen-header";
import { Zone } from "@/shared/components/zone";
import { VALUE_AXIS_PX } from "@/shared/layout/axes";
import { createBrowserSupabaseClient } from "@/shared/lib/supabase/browser";

const EXPIRED = "This link has expired. Ask for a new one.";

type PasswordFormProps = {
  title: string;
  hint: string;
  fallbackHref: string;
  /** The reset letter. The link is checked on Save, not when the page opens. */
  recovery?: boolean;
};

export function PasswordForm({ title, hint, fallbackHref, recovery = false }: PasswordFormProps) {
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (busy) return;
    if (password.trim().length < 8) {
      setMessage("At least 8 characters.");
      return;
    }
    setBusy(true);
    setMessage(null);
    const supabase = createBrowserSupabaseClient();
    if (recovery) {
      const tokenHash = new URLSearchParams(window.location.search).get("token_hash") ?? "";
      if (tokenHash) {
        const verified = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "recovery" });
        if (verified.error) {
          setBusy(false);
          setMessage(EXPIRED);
          return;
        }
      } else {
        const { data } = await supabase.auth.getSession();
        if (!data.session) {
          setBusy(false);
          setMessage(EXPIRED);
          return;
        }
      }
    }
    const { error } = await supabase.auth.updateUser({ password: password.trim() });
    if (!error) await fetch("/api/account/password-set", { method: "POST" }).catch(() => undefined);
    setBusy(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    if (recovery) {
      const url = new URL(window.location.href);
      url.searchParams.delete("token_hash");
      window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
      setMessage("Password saved.");
      window.setTimeout(() => window.location.replace("/main"), 1000);
      return;
    }
    setMessage("Password saved.");
  };

  return (
    <main className="compass-main flex h-dvh flex-col overflow-y-auto bg-white px-[var(--gutter)] pb-12 text-[#111]">
      <ScreenHeader title={title} fallbackHref={fallbackHref} />
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <Zone label="Password">
          <input
            id="new-password"
            type="password"
            autoCapitalize="none"
            autoComplete="new-password"
            aria-label="New password"
            placeholder="New password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="compass-input block w-full border-0 bg-transparent p-0 t-body text-[var(--ink)] caret-[var(--ink)] outline-none placeholder:text-[var(--placeholder)]"
          />
          <p className="mt-2 max-w-xs t-meta text-[var(--grey)]">{hint}</p>
        </Zone>
        <Rule />
        <Zone label="">
          <button
            type="submit"
            disabled={busy}
            className="border-0 bg-sky px-6 py-3 t-caps text-[var(--ink)] disabled:text-[var(--grey)]"
          >
            Save
          </button>
        </Zone>
      </form>
      {message ? (
        <p className="mt-6 max-w-xs t-meta" style={{ marginLeft: VALUE_AXIS_PX }}>
          {message}
        </p>
      ) : null}
    </main>
  );
}

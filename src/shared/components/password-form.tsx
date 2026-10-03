"use client";

import { useEffect, useState } from "react";
import { Rule } from "@/shared/components/rule";
import { ScreenHeader } from "@/shared/components/screen-header";
import { Zone } from "@/shared/components/zone";
import { VALUE_AXIS_PX } from "@/shared/layout/axes";
import { createBrowserSupabaseClient } from "@/shared/lib/supabase/browser";

type PasswordFormProps = {
  title: string;
  hint: string;
  fallbackHref: string;
  exchangeCode?: boolean;
};

export function PasswordForm({ title, hint, fallbackHref, exchangeCode = false }: PasswordFormProps) {
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!exchangeCode) return;
    const code = new URLSearchParams(window.location.search).get("code");
    if (!code) return;
    void createBrowserSupabaseClient().auth.exchangeCodeForSession(code);
  }, [exchangeCode]);

  const save = async () => {
    if (busy) return;
    if (password.trim().length < 8) {
      setMessage("At least 8 characters.");
      return;
    }
    setBusy(true);
    setMessage(null);
    const { error } = await createBrowserSupabaseClient().auth.updateUser({ password: password.trim() });
    setBusy(false);
    setMessage(error ? error.message : "Password saved.");
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

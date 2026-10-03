"use client";

import { useEffect, useState } from "react";
import { ScreenHeader } from "@/shared/components/screen-header";
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
      <div style={{ paddingLeft: VALUE_AXIS_PX }}>
      <p className="mt-3 max-w-xs t-meta">{hint}</p>
      <form
        className="mt-8 flex max-w-xs flex-col"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <label className="t-label" htmlFor="new-password">
          New password
        </label>
        <input
          id="new-password"
          type="password"
          autoCapitalize="none"
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="mt-2 border-b border-[var(--rule)] bg-transparent py-2 t-body outline-none"
        />
        <button
          type="submit"
          disabled={busy}
          className="mt-6 self-start border-0 bg-sky px-6 py-3 t-caps disabled:opacity-40"
        >
          Save
        </button>
      </form>
      {message ? <p className="mt-6 max-w-xs t-meta">{message}</p> : null}
      </div>
    </main>
  );
}

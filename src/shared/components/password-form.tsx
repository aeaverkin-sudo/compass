"use client";

import { useEffect, useState } from "react";
import { createBrowserSupabaseClient } from "@/shared/lib/supabase/browser";

type PasswordFormProps = {
  title: string;
  hint: string;
  exchangeCode?: boolean;
};

export function PasswordForm({ title, hint, exchangeCode = false }: PasswordFormProps) {
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
    <main className="compass-main flex min-h-lvh flex-col bg-white px-8 py-12 text-[#111]">
      <h1 className="text-[32px] font-light leading-tight">{title}</h1>
      <p className="mt-3 max-w-xs text-[14px] font-light leading-snug">{hint}</p>
      <form
        className="mt-8 flex max-w-xs flex-col"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <label className="text-[12px] font-normal tracking-[0.08em] uppercase" htmlFor="new-password">
          New password
        </label>
        <input
          id="new-password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="mt-2 border-b border-[#111] bg-transparent py-2 text-[16px] font-light outline-none"
        />
        <button
          type="submit"
          disabled={busy}
          className="mt-6 self-start border-0 bg-sky px-6 py-3 text-[13px] font-normal tracking-[0.14em] uppercase disabled:opacity-40"
        >
          Save
        </button>
      </form>
      {message ? <p className="mt-6 max-w-xs text-[13px] font-light leading-snug">{message}</p> : null}
    </main>
  );
}

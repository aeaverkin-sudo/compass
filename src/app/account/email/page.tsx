"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BackButton } from "@/shared/components/back-button";
import { cn } from "@/lib/utils";
import { QR_RULE_INSET } from "@main/layout";
import { createBrowserSupabaseClient } from "@/shared/lib/supabase/browser";

export default function ChangeEmailPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const start = async () => {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/account/email/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const body = (await response.json()) as { mode?: string; error?: string };
      if (!response.ok) {
        setMessage(body.error ?? "Could not start the email change");
        return;
      }
      if (body.mode === "code") setStep("code");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not start the email change");
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/account/email/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code }),
      });
      const body = (await response.json()) as { mode?: string; error?: string };
      if (!response.ok) {
        setMessage(body.error ?? "Could not change the email");
        return;
      }
      if (body.mode === "ok") {
        setMessage("Email updated");
        await createBrowserSupabaseClient().auth.refreshSession().catch(() => undefined);
        router.push("/profile");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not change the email");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className={cn("compass-main flex h-dvh flex-col overflow-y-auto bg-white pt-[84px] pb-12 text-[#111]", QR_RULE_INSET)}>
      <BackButton fallbackHref="/profile" />
      <h1 className="text-[32px] font-light leading-tight">Email</h1>
      <p className="mt-3 max-w-xs text-[14px] font-light leading-snug">
        {step === "email"
          ? "A code goes to the new address. Your password stays."
          : "Enter the code from the new address."}
      </p>
      <form
        className="mt-8 flex max-w-xs flex-col"
        onSubmit={(event) => {
          event.preventDefault();
          if (step === "email") void start();
          else void verify();
        }}
      >
        <label className="text-[12px] font-normal tracking-[0.08em] uppercase" htmlFor="change-email">
          Email
        </label>
        <input
          id="change-email"
          type="email"
          autoCapitalize="none"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          disabled={step === "code"}
          className="mt-2 border-b-[0.5px] border-[#999] bg-transparent py-2 text-[16px] font-light outline-none disabled:opacity-60"
        />
        {step === "code" ? (
          <>
            <label className="mt-4 text-[12px] font-normal tracking-[0.08em] uppercase" htmlFor="change-code">
              Code
            </label>
            <input
              id="change-code"
              autoCapitalize="characters"
              autoComplete="one-time-code"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              className="mt-2 border-b-[0.5px] border-[#999] bg-transparent py-2 text-[16px] font-light tracking-[0.2em] outline-none"
            />
          </>
        ) : null}
        <button
          type="submit"
          disabled={busy}
          className="mt-6 self-start border-0 bg-sky px-6 py-3 text-[13px] font-normal tracking-[0.14em] uppercase disabled:opacity-40"
        >
          {step === "email" ? "Continue" : "Save"}
        </button>
      </form>
      {message ? <p className="mt-6 max-w-xs text-[13px] font-light leading-snug">{message}</p> : null}
    </main>
  );
}

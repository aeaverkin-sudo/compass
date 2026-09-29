"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { clearRegisteredDevice } from "@/shared/lib/registered-device";
import { ignoreNextSignedOut } from "@/shared/lib/session-bootstrap";
import { createBrowserSupabaseClient } from "@/shared/lib/supabase/browser";
import { dropPendingItemUpserts } from "@/shared/services/card-items-sync";
import { dropPendingCardUpserts } from "@/shared/services/card-sync";
import { dropPendingNotes } from "@/shared/services/notes-sync";
import { useAppStore } from "@/shared/store/app-store";

export default function DeleteAccountPage() {
  const router = useRouter();
  const [phrase, setPhrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const confirmed = phrase === "DELETE";

  const remove = async () => {
    if (busy || !confirmed) return;
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: "DELETE" }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        setMessage(body.error ?? "Could not delete the account");
        setBusy(false);
        return;
      }
      dropPendingCardUpserts();
      dropPendingItemUpserts();
      dropPendingNotes();
      const user = useAppStore.getState().user;
      useAppStore.setState({
        cards: [],
        contactItems: [],
        currentCardIndex: 0,
        user: { ...user, onboarded: false },
      });
      clearRegisteredDevice();
      ignoreNextSignedOut();
      await createBrowserSupabaseClient().auth.signOut();
      router.replace("/");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not delete the account");
      setBusy(false);
    }
  };

  return (
    <main className="compass-main flex min-h-lvh flex-col bg-white px-8 py-12 text-[#111]">
      <Link href="/profile" className="text-[13px] font-light underline">
        Back to profile
      </Link>
      <h1 className="mt-6 text-[32px] font-light leading-tight">Delete account</h1>
      <p className="mt-3 max-w-xs text-[14px] font-light leading-snug">
        This deletes the account, every portfolio, and every file. It cannot be undone.
      </p>
      <label className="mt-8 text-[12px] font-normal tracking-[0.08em] uppercase" htmlFor="delete-confirm">
        Type DELETE
      </label>
      <input
        id="delete-confirm"
        value={phrase}
        autoCapitalize="characters"
        autoCorrect="off"
        spellCheck={false}
        onChange={(event) => setPhrase(event.target.value)}
        className="mt-2 max-w-xs border-b border-[#111] bg-transparent py-2 text-[16px] font-light tracking-[0.2em] outline-none"
      />
      <button
        type="button"
        disabled={!confirmed || busy}
        onClick={() => void remove()}
        className="mt-6 min-w-[160px] self-start border-0 bg-sky px-6 py-3 text-[13px] font-normal tracking-[0.14em] uppercase disabled:opacity-40"
      >
        Yes, delete
      </button>
      {message ? <p className="mt-6 max-w-xs text-[13px] font-light leading-snug">{message}</p> : null}
    </main>
  );
}

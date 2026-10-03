"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ScreenHeader } from "@/shared/components/screen-header";
import { VALUE_AXIS_PX } from "@/shared/layout/axes";
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
    <main className="compass-main flex h-dvh flex-col overflow-y-auto bg-white px-[var(--gutter)] pb-12 text-[#111]">
      <ScreenHeader title="Delete account" fallbackHref="/profile" />
      <div style={{ paddingLeft: VALUE_AXIS_PX }}>
      <p className="mt-3 max-w-xs t-meta">
        This deletes the account, every portfolio, and every file. It cannot be undone.
      </p>
      <label className="mt-8 t-label" htmlFor="delete-confirm">
        Type DELETE
      </label>
      <input
        id="delete-confirm"
        value={phrase}
        autoCapitalize="characters"
        autoCorrect="off"
        spellCheck={false}
        onChange={(event) => setPhrase(event.target.value)}
        className="mt-2 max-w-xs border-b border-[var(--rule)] bg-transparent py-2 t-body outline-none"
      />
      <button
        type="button"
        disabled={!confirmed || busy}
        onClick={() => void remove()}
        className="mt-6 min-w-[160px] self-start border-0 bg-sky px-6 py-3 t-caps disabled:opacity-40"
      >
        Yes, delete
      </button>
      {message ? <p className="mt-6 max-w-xs t-meta">{message}</p> : null}
      </div>
    </main>
  );
}

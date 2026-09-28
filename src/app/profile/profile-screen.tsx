"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAccountStatus } from "@/shared/hooks/use-account-status";
import { createBrowserSupabaseClient } from "@/shared/lib/supabase/browser";
import { dropPendingItemUpserts } from "@/shared/services/card-items-sync";
import { dropPendingCardUpserts } from "@/shared/services/card-sync";
import { dropPendingNotes } from "@/shared/services/notes-sync";
import { useAppStore } from "@/shared/store/app-store";

function trialLine(hoursLeft: number | null) {
  if (hoursLeft === null) return "Trial";
  return `Trial — ${hoursLeft}h left.`;
}

export function ProfileScreen() {
  const router = useRouter();
  const account = useAccountStatus();
  const [busy, setBusy] = useState(false);
  const signedIn = account?.registered === true;
  const canChangePassword = signedIn && account?.provider === "email";

  const signOut = async () => {
    if (!signedIn || busy) return;
    setBusy(true);
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
    await createBrowserSupabaseClient().auth.signOut();
    router.push("/");
  };

  return (
    <main className="compass-main min-h-lvh overflow-y-auto bg-white px-8 py-12 text-[#111]">
      <Link href="/main" className="text-[13px] font-light underline">
        Card
      </Link>
      <h1 className="mt-6 text-[32px] font-light leading-tight">Profile</h1>

      <section className="mt-10 max-w-xs">
        <h2 className="text-[12px] font-normal tracking-[0.08em] uppercase">Account</h2>
        {!account ? (
          <p className="mt-3 text-[14px] font-light">…</p>
        ) : signedIn ? (
          <p className="mt-3 text-[14px] font-light leading-snug">
            {account.provider === "google"
              ? "Signed in with Google."
              : account.email
                ? `Signed in as ${account.email}.`
                : "Signed in."}
          </p>
        ) : (
          <>
            <p className="mt-3 text-[14px] font-light leading-snug">{trialLine(account.hoursLeft)}</p>
            <p className="mt-3 text-[14px] font-light">
              <Link href="/register" className="underline">
                Register
              </Link>
              {" · "}
              <Link href="/register" className="underline">
                Save forever
              </Link>
            </p>
          </>
        )}
        <p className="mt-4 flex gap-4 text-[14px] font-light">
          {canChangePassword ? (
            <Link href="/account/password" className="underline">
              Change password
            </Link>
          ) : (
            <span className="opacity-40">Change password</span>
          )}
          <button
            type="button"
            disabled={!signedIn || busy}
            onClick={() => void signOut()}
            className="underline disabled:opacity-40"
          >
            Sign out
          </button>
        </p>
      </section>

      <section className="mt-10 max-w-xs">
        <h2 className="text-[12px] font-normal tracking-[0.08em] uppercase">Subscription</h2>
        <p className="mt-3 text-[14px] font-light">Free</p>
      </section>

      <section className="mt-10 max-w-xs">
        <h2 className="text-[12px] font-normal tracking-[0.08em] uppercase">Legal</h2>
        <p className="mt-3 text-[14px] font-light">
          <Link href="/terms" className="underline">
            Terms
          </Link>
          {" · "}
          <Link href="/privacy" className="underline">
            Privacy
          </Link>
        </p>
        <p className="mt-2 text-[14px] font-light">
          {account?.consentVersion ? `Consent ${account.consentVersion}` : "Not recorded"}
        </p>
      </section>
    </main>
  );
}

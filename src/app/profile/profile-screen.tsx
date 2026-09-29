"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Switch } from "@/shared/components/ui/switch";
import { useAccountStatus } from "@/shared/hooks/use-account-status";
import { cardPhotoSrc } from "@/shared/services/card-photo";
import { MAX_CARDS } from "@main/layout";
import { createBrowserSupabaseClient } from "@/shared/lib/supabase/browser";
import { dropPendingItemUpserts } from "@/shared/services/card-items-sync";
import { dropPendingCardUpserts } from "@/shared/services/card-sync";
import { dropPendingNotes } from "@/shared/services/notes-sync";
import { isCardReady, isSolePublic, useAppStore } from "@/shared/store/app-store";

function storageLine(used: number, limit: number) {
  const asMegabytes = (bytes: number) => {
    if (bytes <= 0) return "0 MB";
    const megabytes = bytes / (1024 * 1024);
    if (megabytes < 10) return `${megabytes.toFixed(megabytes < 1 ? 1 : 0)} MB`;
    return `${Math.round(megabytes)} MB`;
  };
  return `${asMegabytes(used)} of ${asMegabytes(limit)}`;
}

function trialLine(hoursLeft: number | null) {
  if (hoursLeft === null) return "Trial";
  return `Trial — ${hoursLeft}h left.`;
}

export function ProfileScreen() {
  const router = useRouter();
  const account = useAccountStatus();
  const cards = useAppStore((state) => state.cards);
  const setCardListed = useAppStore((state) => state.setCardListed);
  const updateSecondCardDraft = useAppStore((state) => state.updateSecondCardDraft);
  const atCardLimit = cards.length >= MAX_CARDS;
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

  if (!account || !signedIn) {
    return (
      <main className="compass-main min-h-lvh overflow-y-auto bg-white px-8 py-12 text-[#111]">
        <Link href="/main" className="text-[13px] font-light underline">
          Back to portfolio
        </Link>
        <h1 className="mt-6 text-[32px] font-light leading-tight">Profile</h1>
        {!account ? (
          <p className="mt-10 text-[14px] font-light">…</p>
        ) : (
          <section className="mt-10 max-w-xs">
            <p className="text-[14px] font-light leading-snug">{trialLine(account.hoursLeft)}</p>
            <Link
              href="/register"
              className="mt-6 inline-block border-0 bg-sky px-6 py-3 text-[13px] font-normal tracking-[0.14em] uppercase"
            >
              Register
            </Link>
            <p className="mt-8 text-[14px] font-light">
              {account.consentVersion ? `Consent ${account.consentVersion}` : "Not recorded"}
            </p>
          </section>
        )}
      </main>
    );
  }

  return (
    <main className="compass-main min-h-lvh overflow-y-auto bg-white px-8 py-12 text-[#111]">
      <Link href="/main" className="text-[13px] font-light underline">
        Back to portfolio
      </Link>
      <h1 className="mt-6 text-[32px] font-light leading-tight">Profile</h1>

      <section className="mt-10 max-w-xs">
        <h2 className="text-[12px] font-normal tracking-[0.08em] uppercase">Account</h2>
        <p className="mt-3 text-[14px] font-light leading-snug">
          {account.provider === "google"
            ? "Signed in with Google."
            : account.email
              ? `Signed in as ${account.email}.`
              : "Signed in."}
        </p>
        <p className="mt-4 flex gap-4 text-[14px] font-light">
          {canChangePassword ? (
            <Link href="/account/password" className="underline">
              Change password
            </Link>
          ) : null}
          <button type="button" disabled={busy} onClick={() => void signOut()} className="underline disabled:opacity-40">
            Sign out
          </button>
        </p>
      </section>

      <section className="mt-10 max-w-sm">
        <h2 className="text-[12px] font-normal tracking-[0.08em] uppercase">Portfolios</h2>
        <ul className="mt-4 space-y-6">
          {cards.map((card) => {
            const ready = isCardReady(card);
            const isPublic = ready && card.listed !== false;
            const locked = ready && isSolePublic(cards, card.id);
            const photo = cardPhotoSrc(card);
            return (
              <li key={card.id} className="flex gap-4">
                {photo ? (
                  <img src={photo} alt="" className="size-12 border border-[#d4d4d4] object-cover" />
                ) : (
                  <span className="size-12 border border-[#d4d4d4]" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[16px] font-light">{card.displayName.trim() || "Untitled"}</p>
                  <div className="mt-2 flex items-center gap-3">
                    <span className="text-[12px] font-normal tracking-[0.08em] uppercase">
                      {isPublic ? "Public" : "Private"}
                    </span>
                    <Switch
                      checked={isPublic}
                      disabled={!ready || locked}
                      onCheckedChange={(checked) => setCardListed(card.id, checked === true)}
                      aria-label={isPublic ? "Public" : "Private"}
                      className="disabled:opacity-100"
                    />
                  </div>
                  {ready ? (
                    <>
                      {locked ? (
                        <p className="mt-2 text-[13px] font-light leading-snug">
                          Your main portfolio is always public — it's how people find you.
                        </p>
                      ) : null}
                      <p className={locked ? "mt-1 text-[13px] font-light leading-snug" : "mt-2 text-[13px] font-light leading-snug"}>
                        {isPublic
                          ? "Public — people you've connected with can see this portfolio behind your others, and find it in search."
                          : "Private — reachable only by its direct link or QR. Kept off your profile and out of search."}
                      </p>
                    </>
                  ) : (
                    <p className="mt-2 text-[13px] font-light leading-snug">
                      Inactive until you add a name and a photo.
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
        {atCardLimit ? null : (
          <button
            type="button"
            className="mt-6 border border-[#111] bg-transparent px-6 py-3 text-[13px] font-normal tracking-[0.14em] uppercase"
            onClick={() => {
              // The column default is public. A new portfolio has to opt out.
              updateSecondCardDraft({ displayName: "" });
              router.push("/main");
            }}
          >
            Create portfolio
          </button>
        )}
      </section>

      <section className="mt-10 max-w-xs">
        <h2 className="text-[12px] font-normal tracking-[0.08em] uppercase">Storage</h2>
        <p className="mt-3 text-[14px] font-light">
          {account ? storageLine(account.bytesUsed, account.bytesLimit) : "…"}
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

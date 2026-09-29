"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Switch } from "@/shared/components/ui/switch";
import { useAccountStatus } from "@/shared/hooks/use-account-status";
import { cardPhotoSrc } from "@/shared/services/card-photo";
import { APP_VERSION, SUPPORT_EMAIL } from "@/shared/lib/app-info";
import { ignoreNextSignedOut } from "@/shared/lib/session-bootstrap";
import { createBrowserSupabaseClient } from "@/shared/lib/supabase/browser";
import { dropPendingItemUpserts } from "@/shared/services/card-items-sync";
import { dropPendingCardUpserts } from "@/shared/services/card-sync";
import { dropPendingNotes } from "@/shared/services/notes-sync";
import { isCardReady, isSolePublic, useAppStore } from "@/shared/store/app-store";

function formatBytes(bytes: number) {
  if (bytes <= 0) return "0 MB";
  const megabytes = bytes / (1024 * 1024);
  if (megabytes < 10) return `${megabytes.toFixed(megabytes < 1 ? 1 : 0)} MB`;
  return `${Math.round(megabytes)} MB`;
}

function storageLine(used: number, limit: number) {
  return `${formatBytes(used)} of ${formatBytes(limit)}`;
}

function planTitle(plan: "free" | "paid") {
  return plan === "paid" ? "Paid" : "Free";
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
  const portfolioLimit = account?.portfolioLimit ?? null;
  const atCardLimit = portfolioLimit !== null && cards.length >= portfolioLimit;
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
    ignoreNextSignedOut();
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

      <section className="mt-10 max-w-xs">
        <h2 className="text-[12px] font-normal tracking-[0.08em] uppercase">Subscription</h2>
        <p className="mt-3 text-[20px] font-light">{planTitle(account.plan)}</p>
        <ul className="mt-3 space-y-1 text-[14px] font-light leading-snug">
          <li>
            Free — {account.catalog.free.portfolios} portfolios, {formatBytes(account.catalog.free.bytes)}
          </li>
          <li>
            Paid — {account.catalog.paid.portfolios} portfolios, {formatBytes(account.catalog.paid.bytes)}
          </li>
        </ul>
        <button
          type="button"
          disabled
          className="mt-4 border-0 bg-sky px-6 py-3 text-[13px] font-normal tracking-[0.14em] uppercase disabled:opacity-40"
        >
          Upgrade
        </button>
        <p className="mt-2 text-[13px] font-light">Coming soon</p>
        {/* Stripe seam: Manage subscription and payment history.
            Checkout and the customer portal will write profiles.plan from a webhook.
            Do not collect card details here. */}
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
        <button
          type="button"
          disabled={atCardLimit || portfolioLimit === null}
          className="mt-6 border-0 bg-sky px-6 py-3 text-[13px] font-normal tracking-[0.14em] uppercase disabled:opacity-40"
          onClick={() => {
            if (portfolioLimit === null) return;
            updateSecondCardDraft({ displayName: "" }, portfolioLimit);
            router.push("/main");
          }}
        >
          Create portfolio
        </button>
      </section>

      <section className="mt-10 max-w-xs">
        <h2 className="text-[12px] font-normal tracking-[0.08em] uppercase">Usage & Limits</h2>
        <p className="mt-3 text-[14px] font-light">{storageLine(account.bytesUsed, account.bytesLimit)}</p>
        <p className="mt-2 text-[14px] font-light">
          {cards.length} of {portfolioLimit ?? "…"} portfolios
        </p>
        {portfolioLimit !== null && portfolioLimit - cards.length === 1 ? (
          <p className="mt-2 text-[13px] font-light leading-snug">One portfolio left on this plan.</p>
        ) : null}
        {account.bytesLimit > 0 && account.bytesUsed / account.bytesLimit >= 0.8 && account.bytesUsed < account.bytesLimit ? (
          <p className="mt-2 text-[13px] font-light leading-snug">Storage is nearly full.</p>
        ) : null}
      </section>

      <section className="mt-10 max-w-xs">
        <h2 className="text-[12px] font-normal tracking-[0.08em] uppercase">Account management</h2>
        <p className="mt-3 text-[14px] font-light">
          <button type="button" disabled className="underline disabled:opacity-40">
            Change email
          </button>
          <span className="mt-1 block text-[13px]">Coming soon</span>
        </p>
        <p className="mt-3 text-[14px] font-light">
          <button type="button" disabled className="underline disabled:opacity-40">
            Export my data
          </button>
          <span className="mt-1 block text-[13px]">Coming soon</span>
        </p>
      </section>

      <section className="mt-10 max-w-xs">
        <h2 className="text-[12px] font-normal tracking-[0.08em] uppercase">About & Legal</h2>
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
          {account.consentVersion ? `Consent ${account.consentVersion}` : "Not recorded"}
        </p>
        <p className="mt-2 text-[14px] font-light">App {APP_VERSION}</p>
        <p className="mt-2 text-[14px] font-light">
          <a href={`mailto:${SUPPORT_EMAIL}`} className="underline">
            {SUPPORT_EMAIL}
          </a>
        </p>
      </section>
    </main>
  );
}

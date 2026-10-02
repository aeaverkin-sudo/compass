"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { BackButton } from "@/shared/components/back-button";
import { ConsentRefresh } from "@/shared/components/consent-refresh";
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
import { cn } from "@/lib/utils";
import { RULE_BOTTOM } from "@/shared/lib/rule";

const ZONE_LABEL =
  "text-[11px] leading-[1.45] font-normal tracking-[0.1em] whitespace-nowrap text-[#999] uppercase";
const ZONE_VALUE =
  "min-w-0 break-words text-[15.5px] leading-[1.45] font-normal tracking-[-0.015em] text-[#111]";

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

function ProfileShell({ children }: { children: ReactNode }) {
  return (
    <main className="compass-main h-dvh overflow-y-auto bg-white px-8 pb-[max(2.5rem,env(safe-area-inset-bottom))] text-[#111]">
      <ConsentRefresh />
      <BackButton fallbackHref="/main" />
      <div className="mt-10 mb-[18px] grid h-[22px] grid-cols-[44px_minmax(0,1fr)_44px] items-center">
        <span aria-hidden className="size-[22px]" />
        <h1 className="text-center text-[14px] leading-[1.45] font-normal tracking-[0.1em] text-[#111] uppercase">
          Profile
        </h1>
      </div>
      {children}
    </main>
  );
}

function Zone({
  label,
  children,
  align = "baseline",
  rule = false,
  id,
}: {
  label: string;
  children: ReactNode;
  align?: "baseline" | "start";
  rule?: boolean | "gray";
  id?: string;
}) {
  return (
    <section
      id={id}
      className={cn(
        "min-w-0 py-[18px]",
        id && "scroll-mt-16",
        rule && RULE_BOTTOM,
      )}
    >
      <div
        className={cn(
          "grid grid-cols-[86px_minmax(0,1fr)] gap-x-[14px]",
          align === "start" ? "items-start" : "items-baseline",
        )}
      >
        <span className={ZONE_LABEL}>{label}</span>
        <div className="min-w-0">{children}</div>
      </div>
    </section>
  );
}

export function ProfileScreen() {
  const router = useRouter();
  const account = useAccountStatus();
  const cards = useAppStore((state) => state.cards);
  const setCardListed = useAppStore((state) => state.setCardListed);
  const setMonochrome = useAppStore((state) => state.setMonochrome);
  const monochrome = useAppStore((state) => state.user.monochrome);
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

  useEffect(() => {
    if (window.location.hash !== "#subscription") return;
    document.getElementById("subscription")?.scrollIntoView();
  }, [account]);

  if (!account || !signedIn) {
    return (
      <ProfileShell>
        {!account ? (
          <p className={cn("py-[18px]", ZONE_VALUE)}>…</p>
        ) : (
          <div className="py-[18px]">
            <p className={ZONE_VALUE}>{trialLine(account.hoursLeft)}</p>
            <Link
              href="/register"
              className="mt-6 inline-block border-0 bg-sky px-6 py-3 text-[13px] font-normal tracking-[0.14em] text-[#111] uppercase"
            >
              Register
            </Link>
            <p className={cn("mt-8", ZONE_VALUE)}>
              {account.consentVersion ? `Consent v${account.consentVersion}` : "Not recorded"}
            </p>
          </div>
        )}
      </ProfileShell>
    );
  }

  const nearPortfolio = portfolioLimit !== null && portfolioLimit - cards.length === 1;
  const nearStorage =
    account.bytesLimit > 0 && account.bytesUsed / account.bytesLimit >= 0.8 && account.bytesUsed < account.bytesLimit;

  return (
    <ProfileShell>
      <Zone label="Account" rule>
        <p className={ZONE_VALUE}>
          {account.provider === "google"
            ? "Signed in with Google."
            : account.email
              ? `Signed in as ${account.email}.`
              : "Signed in."}
        </p>
        <p className="mt-3 flex gap-4 text-[15.5px] leading-[1.45] font-normal tracking-[-0.015em]">
          {canChangePassword ? (
            <Link href="/account/password" className="underline">
              Change password
            </Link>
          ) : null}
          <button type="button" disabled={busy} onClick={() => void signOut()} className="underline disabled:opacity-40">
            Sign out
          </button>
        </p>
      </Zone>

      <Zone id="subscription" label="Subscription" rule>
        <p className={ZONE_VALUE}>{planTitle(account.plan)}</p>
        <ul className="mt-2 space-y-1 text-[15.5px] leading-[1.45] font-normal tracking-[-0.015em] text-[#111]">
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
          className="mt-4 border-0 bg-sky px-[21.6px] py-[10.8px] text-[11.7px] font-normal tracking-[0.14em] text-[#111] uppercase disabled:opacity-100"
        >
          Upgrade
        </button>
        <p className="mt-2 text-[13px] leading-[1.45] font-normal text-[#111]">Coming soon</p>
        {/* Stripe seam: Manage subscription and payment history.
            Checkout and the customer portal will write profiles.plan from a webhook.
            Do not collect card details here. */}
      </Zone>

      <Zone label="Portfolios" align="start" rule>
        <ul className="space-y-6">
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
                  <span className="size-12 shrink-0 border border-[#d4d4d4]" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15.5px] leading-[1.45] font-normal tracking-[-0.015em]">
                    {card.displayName.trim() || "Untitled"}
                  </p>
                  <div className="mt-2 flex items-center gap-3">
                    <span className="text-[11px] leading-[1.45] font-normal tracking-[0.1em] text-[#999] uppercase">
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
                        <p className="mt-2 text-[13px] leading-[1.45] font-normal text-[#111]">
                          Your main portfolio is always public — it's how people find you.
                        </p>
                      ) : null}
                      <p className="mt-2 text-[13px] leading-[1.45] font-normal text-[#111]">
                        {isPublic
                          ? "Public — people you've connected with can see this portfolio behind your others, and find it in search."
                          : "Private — reachable only by its direct link or QR. Kept off your profile and out of search."}
                      </p>
                    </>
                  ) : (
                    <p className="mt-2 text-[13px] leading-[1.45] font-normal text-[#111]">
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
          className="mt-6 border-0 bg-sky px-[21.6px] py-[10.8px] text-[11.7px] font-normal tracking-[0.14em] text-[#111] uppercase disabled:opacity-40"
          onClick={() => {
            if (portfolioLimit === null) return;
            updateSecondCardDraft({ displayName: "" }, portfolioLimit);
            router.push("/main");
          }}
        >
          Create portfolio
        </button>
      </Zone>

      <Zone label="Usage" rule>
        <p className={ZONE_VALUE}>{storageLine(account.bytesUsed, account.bytesLimit)}</p>
        <p className="mt-1 text-[15.5px] leading-[1.45] font-normal tracking-[-0.015em] text-[#111]">
          {cards.length} of {portfolioLimit ?? "…"} portfolios
        </p>
        {nearPortfolio ? (
          <p className="mt-2 text-[13px] leading-[1.45] font-normal text-[#111]">One portfolio left on this plan.</p>
        ) : null}
        {nearStorage ? (
          <p className="mt-2 text-[13px] leading-[1.45] font-normal text-[#111]">Storage is nearly full.</p>
        ) : null}
      </Zone>

      <Zone label="Color" rule>
        <div className="flex items-center gap-3">
          <span className="text-[13px] leading-[1.45] font-normal tracking-[0.18em] text-[#999] uppercase">
            C mode
          </span>
          <Switch
            checked={Boolean(monochrome)}
            onCheckedChange={(checked) => setMonochrome(checked === true)}
            aria-label={monochrome ? "BW mode" : "C mode"}
          />
          <span className="text-[13px] leading-[1.45] font-normal tracking-[0.18em] text-[#999] uppercase">
            BW mode
          </span>
        </div>
      </Zone>

      <Zone label="Manage" rule="gray">
        <p className={ZONE_VALUE}>
          {account.provider === "email" ? (
            <Link href="/account/email" className="underline">
              Change email
            </Link>
          ) : (
            <button type="button" disabled className="underline disabled:opacity-40">
              Change email
            </button>
          )}
        </p>
        {account.provider === "google" ? (
          <p className="mt-1 text-[13px] leading-[1.45] font-normal text-[#111]">Managed by Google</p>
        ) : account.provider === "email" ? null : (
          <p className="mt-1 text-[13px] leading-[1.45] font-normal text-[#111]">Coming soon</p>
        )}
        <div className="hidden">
          <p className="mt-3 text-[15.5px] leading-[1.45] font-normal tracking-[-0.015em]">
            <button type="button" disabled className="underline disabled:opacity-40">
              Export my data
            </button>
          </p>
          <p className="mt-1 text-[13px] leading-[1.45] font-normal text-[#111]">Coming soon</p>
        </div>
        <p className="mt-3 text-[15.5px] leading-[1.45] font-normal tracking-[-0.015em]">
          <Link href="/account/delete" className="underline">
            Delete account
          </Link>
        </p>
      </Zone>

      <Zone label="About">
        <p className={ZONE_VALUE}>
          <Link href="/terms" className="underline">
            Terms
          </Link>
          {" · "}
          <Link href="/privacy" className="underline">
            Privacy
          </Link>
        </p>
        <p className="mt-2 text-[15.5px] leading-[1.45] font-normal tracking-[-0.015em] text-[#111]">
          {account.consentVersion ? `Consent v${account.consentVersion}` : "Not recorded"}
        </p>
        <p className="mt-1 text-[15.5px] leading-[1.45] font-normal tracking-[-0.015em] text-[#111]">App {APP_VERSION}</p>
        <p className="mt-1 text-[15.5px] leading-[1.45] font-normal tracking-[-0.015em] text-[#111]">
          <a href={`mailto:${SUPPORT_EMAIL}`} className="underline">
            {SUPPORT_EMAIL}
          </a>
        </p>
      </Zone>
    </ProfileShell>
  );
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { ScreenHeader } from "@/shared/components/screen-header";
import { Zone } from "@/shared/components/zone";
import { ConsentRefresh } from "@/shared/components/consent-refresh";
import { KeepProfileButton } from "@/shared/components/keep-profile-button";
import { SkyToast } from "@/shared/components/sky-toast";
import { openWalletPass, WALLET_SOON } from "@/shared/lib/wallet-client";
import { Switch } from "@/shared/components/ui/switch";
import { useAccountStatus } from "@/shared/hooks/use-account-status";
import { cardPhotoSrc } from "@/shared/services/card-photo";
import { APP_VERSION, SUPPORT_EMAIL } from "@/shared/lib/app-info";
import { deletionLine } from "@/shared/lib/deletion-date";
import { ignoreNextSignedOut } from "@/shared/lib/session-bootstrap";
import { createBrowserSupabaseClient } from "@/shared/lib/supabase/browser";
import { dropPendingItemUpserts } from "@/shared/services/card-items-sync";
import { dropPendingCardUpserts } from "@/shared/services/card-sync";
import { dropPendingNotes } from "@/shared/services/notes-sync";
import { isCardReady, isSolePublic, useAppStore } from "@/shared/store/app-store";
import { cn } from "@/lib/utils";

const ZONE_VALUE =
  "min-w-0 break-words t-body text-[var(--ink)]";

const PAID_TIER_ENABLED = false;

const PORTFOLIOS_OPEN_KEY = "aded:profile-portfolios-open";

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

type Sharing = { analytics: boolean; connections: boolean };

/** What every event registration shares. Moved here from the event page. */
function SharingSettings({ initial }: { initial: Sharing }) {
  const [sharing, setSharing] = useState(initial);

  const save = (next: Sharing) => {
    const previous = sharing;
    setSharing(next);
    void fetch("/api/account/sharing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    })
      .then((response) => {
        if (!response.ok) setSharing(previous);
      })
      .catch(() => setSharing(previous));
  };

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <div className="flex items-start gap-3">
        <Switch
          checked={sharing.analytics}
          onCheckedChange={(checked) => save({ ...sharing, analytics: checked === true })}
          aria-labelledby="profile-sharing-analytics"
          className="mt-[2px] shrink-0"
        />
        <span className="min-w-0">
          <span id="profile-sharing-analytics" className="block t-body text-[var(--ink)]">
            Share anonymous analytics
          </span>
          <span className="mt-1 block t-meta text-[var(--grey)]">
            Nobody sees your personal details — only an anonymous business summary.
          </span>
        </span>
      </div>
      <div className="flex items-start gap-3">
        <Switch
          checked={sharing.connections}
          onCheckedChange={(checked) => save({ ...sharing, connections: checked === true })}
          aria-labelledby="profile-sharing-connections"
          className="mt-[2px] shrink-0"
        />
        <span className="min-w-0">
          <span id="profile-sharing-connections" className="block t-body text-[var(--ink)]">
            Allow connections
          </span>
          <span className="mt-1 block t-meta text-[var(--grey)]">
            Your summary can be matched to the right people — say, an investor you&apos;re looking for.
          </span>
        </span>
      </div>
    </div>
  );
}

function ProfileShell({ children }: { children: ReactNode }) {
  return (
    <main className="compass-main h-dvh overflow-y-auto bg-white px-[var(--gutter)] pb-[max(2.5rem,env(safe-area-inset-bottom))] text-[#111]">
      <ConsentRefresh />
      <ScreenHeader title="Profile" fallbackHref="/main" />
      {children}
    </main>
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
  const [portfoliosOpen, setPortfoliosOpen] = useState(true);
  const [walletNotice, setWalletNotice] = useState<string | null>(null);
  const walletBusy = useRef(false);
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
    if (window.location.hash === "#portfolios") return;
    if (window.localStorage.getItem(PORTFOLIOS_OPEN_KEY) !== "0") return;
    void Promise.resolve().then(() => setPortfoliosOpen(false));
  }, []);

  const togglePortfolios = () => {
    const next = !portfoliosOpen;
    setPortfoliosOpen(next);
    try {
      window.localStorage.setItem(PORTFOLIOS_OPEN_KEY, next ? "1" : "0");
    } catch {
      /* private mode: open again on the next visit */
    }
  };

  const putInWallet = (cardId: string) => {
    if (walletBusy.current) return;
    walletBusy.current = true;
    void openWalletPass(`/api/cards/${encodeURIComponent(cardId)}/pass`)
      .then((opened) => {
        if (!opened) setWalletNotice(WALLET_SOON);
      })
      .finally(() => {
        walletBusy.current = false;
      });
  };

  useEffect(() => {
    if (window.location.hash !== "#subscription") return;
    document.getElementById("subscription")?.scrollIntoView();
  }, [account]);

  useEffect(() => {
    if (window.location.hash !== "#portfolios") return;
    setPortfoliosOpen(true);
    try {
      window.localStorage.setItem(PORTFOLIOS_OPEN_KEY, "1");
    } catch {
      /* private mode: keep the section open this visit */
    }
    document.getElementById("portfolios")?.scrollIntoView();
  }, [account]);

  const eventPass = !signedIn ? (account?.eventPass ?? null) : null;

  if (!account || (!signedIn && !eventPass)) {
    return (
      <ProfileShell>
        {!account ? (
          <p className={cn("py-[18px]", ZONE_VALUE)}>…</p>
        ) : (
          <div className="py-[18px]">
            <p className={ZONE_VALUE}>{trialLine(account.hoursLeft)}</p>
            <Link
              href="/register"
              className="mt-6 inline-block border-0 bg-sky px-6 py-3 t-caps text-[var(--ink)]"
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
      {eventPass ? (
        <Zone label="Event pass" align="start" rule>
          <p className={ZONE_VALUE}>
            {eventPass.passes[0] ? `Event pass · ${eventPass.passes[0].eventName}` : "Event pass"}
          </p>
          {deletionLine(eventPass.deleteAt) ? (
            <p className="mt-2 mb-0 t-meta text-[var(--ink)]">{deletionLine(eventPass.deleteAt)}</p>
          ) : null}
          <KeepProfileButton className="mt-6" />
          {eventPass.keepByTap ? <p className="mt-2 mb-0 t-meta text-[var(--grey)]">Free. One tap — no password.</p> : null}
        </Zone>
      ) : (
        <Zone label="Account" rule>
          <p className={ZONE_VALUE}>
            {account.provider === "google"
              ? "Signed in with Google."
              : account.email
                ? `Signed in as ${account.email}.`
                : "Signed in."}
          </p>
          <p className="mt-3 flex gap-4 t-body">
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
      )}

      <Zone id="subscription" label="Plan" rule>
        <p className={ZONE_VALUE}>{planTitle(account.plan)}</p>
        <ul className="mt-2 space-y-1 t-body text-[var(--ink)]">
          <li>
            Free — {account.catalog.free.portfolios} portfolios, {formatBytes(account.catalog.free.bytes)}
          </li>
          {PAID_TIER_ENABLED ? (
            <li>
              Paid — {account.catalog.paid.portfolios} portfolios, {formatBytes(account.catalog.paid.bytes)}
            </li>
          ) : null}
        </ul>
        {PAID_TIER_ENABLED ? (
          <>
            <button
              type="button"
              disabled
              className="mt-4 border-0 bg-sky px-[21.6px] py-[10.8px] t-caps text-[var(--ink)] disabled:opacity-100"
            >
              Upgrade
            </button>
            <p className="mt-2 t-meta text-[var(--ink)]">Coming soon</p>
          </>
        ) : null}
        {/* Stripe seam: Manage subscription and payment history.
            Checkout and the customer portal will write profiles.plan from a webhook.
            Do not collect card details here. */}
      </Zone>

      <Zone
        id="portfolios"
        label={
          <button
            type="button"
            aria-expanded={portfoliosOpen}
            onClick={togglePortfolios}
            className="press flex items-center gap-1 border-0 bg-transparent p-0 t-label [-webkit-tap-highlight-color:transparent]"
          >
            Portfolios
            <ChevronRight
              aria-hidden
              className={cn("size-3 shrink-0 transition-transform", portfoliosOpen && "rotate-90")}
              strokeWidth={1.5}
            />
          </button>
        }
        align="start"
        rule
      >
        {portfoliosOpen ? (
        <ul className="mb-6 space-y-6">
          {cards.map((card) => {
            const ready = isCardReady(card);
            const isPublic = ready && card.listed !== false;
            const locked = ready && isSolePublic(cards, card.id);
            const photo = cardPhotoSrc(card);
            return (
              <li key={card.id} className="flex gap-4">
                {photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photo} alt="" className="size-12 border border-[#d4d4d4] object-cover" />
                ) : (
                  <span className="size-12 shrink-0 border border-[#d4d4d4]" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate t-body">
                    {card.displayName.trim() || "Untitled"}
                  </p>
                  {ready ? (
                    <button
                      type="button"
                      onClick={() => putInWallet(card.id)}
                      className="mt-1 border-0 bg-transparent p-0 t-meta text-[var(--ink)] underline"
                    >
                      Put in Wallet
                    </button>
                  ) : null}
                  <div className="mt-2 flex items-center gap-3">
                    <span className="t-label">
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
                        <p className="mt-2 t-meta text-[var(--ink)]">
                          Your main portfolio is always public — it&apos;s how people find you.
                        </p>
                      ) : null}
                      <p className="mt-2 t-meta text-[var(--ink)]">
                        {isPublic
                          ? "Public — people you've connected with can see this portfolio behind your others, and find it in search."
                          : "Private — reachable only by its direct link or QR. Kept off your profile and out of search."}
                      </p>
                    </>
                  ) : (
                    <p className="mt-2 t-meta text-[var(--ink)]">
                      Inactive until you add a name.
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
        ) : null}
        <button
          type="button"
          disabled={atCardLimit || portfolioLimit === null}
          className="border-0 bg-sky px-[21.6px] py-[10.8px] t-band leading-[calc(13px*1.45)] text-[var(--ink)] disabled:opacity-40"
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
        <p className="mt-1 t-body text-[var(--ink)]">
          {cards.length} of {portfolioLimit ?? "…"} portfolios
        </p>
        {nearPortfolio ? (
          <p className="mt-2 t-meta text-[var(--ink)]">One portfolio left on this plan.</p>
        ) : null}
        {nearStorage ? (
          <p className="mt-2 t-meta text-[var(--ink)]">Storage is nearly full.</p>
        ) : null}
      </Zone>

      <Zone label="Color" rule>
        <div className="flex items-center gap-3">
          <span className="t-caps text-[var(--grey)]">
            C mode
          </span>
          <Switch
            checked={Boolean(monochrome)}
            onCheckedChange={(checked) => setMonochrome(checked === true)}
            aria-label={monochrome ? "BW mode" : "C mode"}
          />
          <span className="t-caps text-[var(--grey)]">
            BW mode
          </span>
        </div>
      </Zone>

      <Zone label="Sharing" align="start" rule>
        <SharingSettings initial={account.sharing ?? { analytics: true, connections: true }} />
      </Zone>

      <Zone label="Manage" rule>
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
          <p className="mt-1 t-meta text-[var(--ink)]">Managed by Google</p>
        ) : account.provider === "email" || eventPass ? null : (
          <p className="mt-1 t-meta text-[var(--ink)]">Coming soon</p>
        )}
        <div className="hidden">
          <p className="mt-3 t-body">
            <button type="button" disabled className="underline disabled:opacity-40">
              Export my data
            </button>
          </p>
          <p className="mt-1 t-meta text-[var(--ink)]">Coming soon</p>
        </div>
        <p className="mt-3 t-body">
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
        <p className="mt-2 t-body text-[var(--ink)]">
          {account.consentVersion ? `Consent v${account.consentVersion}` : "Not recorded"}
        </p>
        <p className="mt-1 t-body text-[var(--ink)]">App {APP_VERSION}</p>
        <p className="mt-1 t-body text-[var(--ink)]">
          <a href={`mailto:${SUPPORT_EMAIL}`} className="underline">
            {SUPPORT_EMAIL}
          </a>
        </p>
      </Zone>
      {walletNotice ? <SkyToast text={walletNotice} onDone={() => setWalletNotice(null)} /> : null}
    </ProfileShell>
  );
}

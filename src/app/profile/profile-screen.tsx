"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ChevronRight, Download } from "lucide-react";
import { MarkPlus } from "@/shared/components/mark-plus";
import { NUMBER_CLASS } from "@/shared/components/section-number";
import { ScreenHeader } from "@/shared/components/screen-header";
import { MainTabs } from "@main/components/main-tabs";
import { Zone } from "@/shared/components/zone";
import { ConsentRefresh } from "@/shared/components/consent-refresh";
import { KeepProfileButton } from "@/shared/components/keep-profile-button";
import { cachedWalletStatus, cardInWallet, forgetWalletStatus, openWalletPass, walletIsConfigured, WALLET_RECHECK_MS } from "@/shared/lib/wallet-client";
import { Switch } from "@/shared/components/ui/switch";
import { useAccountRead } from "@/shared/hooks/use-account-status";
import { cardPhotoSrc } from "@/shared/services/card-photo";
import { photoSlotLookClass } from "@/shared/lib/photo-look";
import { APP_VERSION, SUPPORT_EMAIL } from "@/shared/lib/app-info";
import { deletionLine } from "@/shared/lib/deletion-date";
import { ignoreNextSignedOut, markRegistrationRequired } from "@/shared/lib/session-bootstrap";
import { forgetAccountEmail, signInPath } from "@/shared/lib/registered-device";
import { createBrowserSupabaseClient } from "@/shared/lib/supabase/browser";
import { dropPendingItemUpserts } from "@/shared/services/card-items-sync";
import { dropPendingCardUpsert, dropPendingCardUpserts, forgetLibraryOwner, upsertCardScalars } from "@/shared/services/card-sync";
import { handleWithNewCode } from "@/shared/services/card-handle";
import { NewLinkDialog } from "./new-link-dialog";
import { dropPendingNotes } from "@/shared/services/notes-sync";
import { canAddMoreCards, isCardReady, useAppStore } from "@/shared/store/app-store";
import { COLUMN_GAP_PX, LABEL_COLUMN_PX } from "@/shared/layout/axes";
import { cn } from "@/lib/utils";

const ZONE_VALUE =
  "min-w-0 break-words t-body text-[var(--ink)]";

const PORTFOLIOS_OPEN_KEY = "aded:profile-portfolios-open";
const ROW = {
  gridTemplateColumns: `${LABEL_COLUMN_PX}px minmax(0, 1fr)`,
  columnGap: COLUMN_GAP_PX,
} as const;

function AccountChapter({ number, title }: { number: string; title: string }) {
  return (
    <h2 className="flex items-center gap-[14px] border-b border-[var(--rule)] py-[18px]">
      <span className={NUMBER_CLASS}>{number}</span>
      <span className="t-caps text-[var(--ink)]">{title}</span>
    </h2>
  );
}

/** On: a card shared back arrives pending. Off: share-back writes nothing. */
function ShareBackSetting() {
  const [accept, setAccept] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/account/share-back", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok || cancelled) return;
        const body = (await response.json()) as { accept?: boolean };
        if (!cancelled && typeof body.accept === "boolean") setAccept(body.accept);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const save = (next: boolean) => {
    const previous = accept;
    setAccept(next);
    void fetch("/api/account/share-back", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accept: next }),
    })
      .then((response) => {
        if (!response.ok) setAccept(previous);
      })
      .catch(() => setAccept(previous));
  };

  return (
    <>
      <div className="flex min-w-0 items-center gap-3">
        <Switch
          checked={accept}
          onCheckedChange={(checked) => save(checked === true)}
          aria-labelledby="profile-share-back"
          className="shrink-0"
        />
        <span id="profile-share-back" className="min-w-0 t-body text-[var(--ink)]">
          Cards shared back to you
        </span>
      </div>
      <span className="col-start-2 mt-1 block pl-12 t-meta text-[var(--grey)]">
        On — arrive as pending, you say Yes/No. Off — nobody can send their card back.
      </span>
    </>
  );
}

function ProfileShell({ children }: { children: ReactNode }) {
  return (
    <main className="compass-main flex h-dvh flex-col overflow-hidden bg-white text-[#111]">
      <div className="min-h-0 flex-1 overflow-y-auto px-[var(--gutter)]">
        <div className="network-scroll-spring">
          <ConsentRefresh />
          <ScreenHeader title="Account" fallbackHref="/main" />
          {children}
        </div>
      </div>
      <MainTabs current="account" />
    </main>
  );
}

export function ProfileScreen() {
  const router = useRouter();
  const { status: account, ready } = useAccountRead();
  const cards = useAppStore((state) => state.cards);
  const setMonochrome = useAppStore((state) => state.setMonochrome);
  const monochrome = useAppStore((state) => state.user.monochrome);
  const updateSecondCardDraft = useAppStore((state) => state.updateSecondCardDraft);
  const updateCard = useAppStore((state) => state.updateCard);
  const portfolioLimit = account?.portfolioLimit ?? null;
  const [busy, setBusy] = useState(false);
  const creatingPortfolio = useRef(false);
  const [portfolioBusy, setPortfolioBusy] = useState(false);
  const [portfoliosOpen, setPortfoliosOpen] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const [walletOff, setWalletOff] = useState(false);
  const [linkCardId, setLinkCardId] = useState<string | null>(null);
  const [linkBusy, setLinkBusy] = useState(false);
  const [inWallet, setInWallet] = useState<Record<string, boolean>>({});
  const walletBusy = useRef(false);
  const walletRead = useRef(new Map<string, number>());
  const walletPollGen = useRef(new Map<string, number>());
  const walletPolls = useRef<number[]>([]);
  const readyWalletKey = cards.filter((card) => isCardReady(card)).map((card) => card.id).join("|");
  const signedIn = account?.registered === true;
  const canChangePassword = signedIn && account?.provider === "email";

  const signOut = async () => {
    if (!signedIn || busy) return;
    setBusy(true);
    dropPendingCardUpserts();
    dropPendingItemUpserts();
    dropPendingNotes();
    const user = useAppStore.getState().user;
    forgetLibraryOwner();
    useAppStore.setState({
      cards: [],
      contactItems: [],
      currentCardIndex: 0,
      user: { ...user, onboarded: false },
    });
    forgetWalletStatus();
    try {
      window.localStorage.removeItem("aded:wallet-hint");
    } catch {
      /* private mode */
    }
    ignoreNextSignedOut();
    await createBrowserSupabaseClient().auth.signOut({ scope: "local" });
    markRegistrationRequired();
    if (account?.provider === "google" || account?.provider === "apple") {
      forgetAccountEmail();
    }
    try {
      sessionStorage.setItem("aded-signed-out", "1");
    } catch {
      // A private tab still leaves through the sign-in screen.
    }
    router.replace(signInPath());
  };

  useEffect(() => {
    if (window.location.hash === "#portfolios") return;
    if (window.localStorage.getItem(PORTFOLIOS_OPEN_KEY) !== "1") return;
    void Promise.resolve().then(() => setPortfoliosOpen(true));
  }, []);

  const createPortfolio = () => {
    if (creatingPortfolio.current || portfolioLimit === null || !canAddMoreCards(cards, portfolioLimit)) return;
    creatingPortfolio.current = true;
    setPortfolioBusy(true);
    updateSecondCardDraft({ displayName: "" }, portfolioLimit);
    router.push("/main");
  };

  const togglePortfolios = () => {
    const next = !portfoliosOpen;
    setPortfoliosOpen(next);
    try {
      window.localStorage.setItem(PORTFOLIOS_OPEN_KEY, next ? "1" : "0");
    } catch {
      /* private mode: open again on the next visit */
    }
  };

  useLayoutEffect(() => {
    const seed: Record<string, boolean> = {};
    for (const card of useAppStore.getState().cards) {
      const known = cachedWalletStatus(card.id);
      if (typeof known === "boolean") seed[card.id] = known;
    }
    if (Object.keys(seed).length === 0) return;
    setInWallet((current) => ({ ...seed, ...current }));
  }, []);

  const markWallet = useCallback((cardId: string, added: boolean) => {
    setInWallet((current) => (current[cardId] === added ? current : { ...current, [cardId]: added }));
  }, []);

  const watchWallet = useCallback((cardId: string) => {
    const generation = (walletPollGen.current.get(cardId) ?? 0) + 1;
    walletPollGen.current.set(cardId, generation);
    for (const delay of WALLET_RECHECK_MS) {
      const timer = window.setTimeout(() => {
        if (walletPollGen.current.get(cardId) !== generation) return;
        void cardInWallet(cardId).then((added) => {
          if (walletPollGen.current.get(cardId) !== generation || added !== true) return;
          markWallet(cardId, true);
        });
      }, delay);
      walletPolls.current.push(timer);
    }
  }, [markWallet]);

  const confirmNewLink = () => {
    if (linkBusy || !linkCardId) return;
    const { cards: liveCards } = useAppStore.getState();
    const card = liveCards.find((entry) => entry.id === linkCardId);
    if (!card) return;
    const next = handleWithNewCode(card, liveCards);
    if (!next) return;
    const before = card.handle?.trim().toLowerCase() ?? "";
    setLinkBusy(true);
    dropPendingCardUpsert(card.id);
    void upsertCardScalars({ ...card, handle: next, updatedAt: new Date().toISOString() })
      .then((result) => {
        if (result !== "ok") return;
        const live = useAppStore.getState().cards.find((entry) => entry.id === card.id);
        const liveHandle = live?.handle?.trim().toLowerCase() ?? "";
        if (!liveHandle) {
          if (before) updateCard(card.id, { handle: before });
          return;
        }
        if (liveHandle === before) updateCard(card.id, { handle: next });
        setLinkCardId(null);
      })
      .catch(() => undefined)
      .finally(() => setLinkBusy(false));
  };

  const putInWallet = (cardId: string) => {
    if (walletBusy.current) return;
    walletBusy.current = true;
    void openWalletPass(`/api/cards/${encodeURIComponent(cardId)}/pass`)
      .then((opened) => {
        if (!opened) return;
        watchWallet(cardId);
      })
      .finally(() => {
        walletBusy.current = false;
      });
  };

  useEffect(() => {
    const ids = readyWalletKey ? readyWalletKey.split("|") : [];
    const reads = walletRead.current;
    const refresh = () => {
      for (const cardId of ids) {
        const ticket = (reads.get(cardId) ?? 0) + 1;
        reads.set(cardId, ticket);
        void cardInWallet(cardId).then((added) => {
          if (reads.get(cardId) !== ticket || added === null) return;
          markWallet(cardId, added);
        });
      }
    };
    const readConfigured = () => {
      void walletIsConfigured().then((ready) => {
        if (ready === false) setWalletOff(true);
        else if (ready === true) setWalletOff(false);
      });
    };
    refresh();
    readConfigured();
    let returnTimer = 0;
    const onReturn = () => {
      if (document.visibilityState === "hidden") return;
      window.clearTimeout(returnTimer);
      returnTimer = window.setTimeout(() => {
        refresh();
        readConfigured();
      }, 300);
    };
    document.addEventListener("visibilitychange", onReturn);
    window.addEventListener("focus", onReturn);
    return () => {
      for (const cardId of ids) reads.set(cardId, (reads.get(cardId) ?? 0) + 1);
      window.clearTimeout(returnTimer);
      document.removeEventListener("visibilitychange", onReturn);
      window.removeEventListener("focus", onReturn);
    };
  }, [markWallet, readyWalletKey]);

  useEffect(() => {
    const polls = walletPolls;
    const gens = walletPollGen;
    return () => {
      polls.current.forEach((id) => window.clearTimeout(id));
      polls.current = [];
      for (const [cardId, generation] of gens.current) gens.current.set(cardId, generation + 1);
    };
  }, []);

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
          ready ? (
            <div className="py-[18px]">
              <p className={ZONE_VALUE}>Sign in to open your account.</p>
              <Link
                href={`/register?signin=1&next=${encodeURIComponent("/profile")}`}
                className="mt-6 inline-block border-0 bg-sky px-6 py-3 t-caps text-[var(--ink)]"
              >
                Sign in
              </Link>
            </div>
          ) : (
            <p className={cn("py-[18px]", ZONE_VALUE)}>…</p>
          )
        ) : (
          <div className="py-[18px]">
            <p className={ZONE_VALUE}>No account yet.</p>
            <Link
              href="/create"
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
      ) : null}

      <AccountChapter number="01" title="Settings" />
      {signedIn ? (
        <section className="min-w-0 border-b border-[var(--rule)] py-[18px]">
          <div className="grid items-center" style={ROW}>
            <span className="t-label">Signed in</span>
            <p className={`${ZONE_VALUE} mb-0`}>{account.email ?? "Signed in."}</p>
            {account.provider === "email" ? (
              <p className="col-start-2 mt-3 mb-0 justify-self-start t-body">
                <Link href="/account/email" className="underline">
                  Change email
                </Link>
                {canChangePassword ? (
                  <>
                    {" · "}
                    <Link href="/account/password" className="underline">
                      Change password
                    </Link>
                  </>
                ) : null}
              </p>
            ) : null}
            <button
              type="button"
              disabled={busy}
              onClick={() => void signOut()}
              className="col-start-2 mt-3 justify-self-start t-body underline disabled:opacity-40"
            >
              Sign out
            </button>
          </div>
        </section>
      ) : null}

      <section id="portfolios" className="scroll-mt-16 border-b border-[var(--rule)] py-[18px]">
        <button
          type="button"
          aria-expanded={portfoliosOpen}
          onClick={togglePortfolios}
          className="grid w-full items-center border-0 bg-transparent p-0 text-left [-webkit-tap-highlight-color:transparent]"
          style={ROW}
        >
          <span className="t-label">Portfolio</span>
          <span className="flex min-w-0 items-center">
            <span className="t-body text-[var(--ink)]">
              {cards.length}
              {` / ${portfolioLimit ?? "…"}`}
            </span>
            <ChevronRight
              aria-hidden
              className={cn("ml-auto size-5 shrink-0 text-[var(--ink)] transition-transform", portfoliosOpen && "rotate-90")}
              strokeWidth={1.5}
            />
          </span>
        </button>
        {portfoliosOpen ? (
          <div className="pt-[18px]" style={{ paddingLeft: LABEL_COLUMN_PX + COLUMN_GAP_PX }}>
            <ul className="space-y-6">
              {cards.map((card) => {
                const ready = isCardReady(card);
                const photo = cardPhotoSrc(card);
                return (
                  <li key={card.id} className="flex gap-4">
                    {photo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={photo} alt="" className={cn("size-12 object-cover", photoSlotLookClass("shadow"))} />
                    ) : (
                      <span className={cn("size-12 shrink-0 bg-white", photoSlotLookClass("shadow"))} />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate t-body">{card.displayName.trim() || "Untitled"}</p>
                      {ready ? (
                        <>
                          {walletOff && inWallet[card.id] !== true ? null : inWallet[card.id] === true ? (
                            <p className="mt-1 t-label">IN WALLET</p>
                          ) : (
                            <button
                              type="button"
                              onClick={() => putInWallet(card.id)}
                              className="mt-1 border-0 bg-transparent p-0 t-label underline"
                            >
                              PUT IN WALLET
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              if (linkCardId) return;
                              setLinkCardId(card.id);
                            }}
                            className="mt-1 block border-0 bg-transparent p-0 text-left t-label underline"
                          >
                            NEW LINK
                          </button>
                        </>
                      ) : (
                        <p className="mt-1 t-meta text-[var(--ink)]">Inactive until you add a name.</p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
            {portfolioLimit !== null && canAddMoreCards(cards, portfolioLimit) ? (
              <div className={cn("flex flex-col items-start gap-4", cards.length > 0 && "mt-6")}>
                {Array.from({ length: portfolioLimit - cards.length }, (_, index) => (
                  <button
                    key={index}
                    type="button"
                    aria-label="Create portfolio"
                    disabled={portfolioBusy}
                    onClick={createPortfolio}
                    className="border-0 bg-transparent p-0 text-[var(--ink)] disabled:opacity-40"
                  >
                    <MarkPlus />
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      <Zone label="Color" rule>
        <div className="flex items-center gap-3">
          <span className="text-[13px] font-normal leading-[1.45] text-[var(--ink)]">C mode</span>
          <Switch
            checked={Boolean(monochrome)}
            onCheckedChange={(checked) => setMonochrome(checked === true)}
            aria-label={monochrome ? "BW mode" : "C mode"}
          />
          <span className="text-[13px] font-normal leading-[1.45] text-[var(--ink)]">BW mode</span>
        </div>
      </Zone>

      <section className="min-w-0 border-b border-[var(--rule)] py-[18px]">
        <div className="grid items-center" style={ROW}>
          <span className="t-label">Network</span>
          <ShareBackSetting />
        </div>
      </section>

      <AccountChapter number="02" title="Info & legal" />
      <Link
        href="/info"
        className="flex items-center border-b border-[var(--rule)] py-[18px] [-webkit-tap-highlight-color:transparent]"
      >
        <span className="t-label">User guide</span>
        <ChevronRight aria-hidden className="ml-auto size-5 text-[var(--ink)]" strokeWidth={1.5} />
      </Link>
      <Link
        href="/legal"
        className="flex items-center border-b border-[var(--rule)] py-[18px] [-webkit-tap-highlight-color:transparent]"
      >
        <span className="t-label">Legal</span>
        <ChevronRight aria-hidden className="ml-auto size-5 text-[var(--ink)]" strokeWidth={1.5} />
      </Link>
      <section className="border-b border-[var(--rule)] py-[18px]">
        <button
          type="button"
          aria-expanded={supportOpen}
          onClick={() => setSupportOpen((open) => !open)}
          className="flex w-full items-center border-0 bg-transparent p-0 text-left [-webkit-tap-highlight-color:transparent]"
        >
          <span className="t-label">Support</span>
          <ChevronRight
            aria-hidden
            className={cn("ml-auto size-5 text-[var(--ink)] transition-transform", supportOpen && "rotate-90")}
            strokeWidth={1.5}
          />
        </button>
        {supportOpen ? (
          <div className="pt-[18px]" style={{ paddingLeft: LABEL_COLUMN_PX + COLUMN_GAP_PX }}>
            <p className="m-0 t-body">
              Have a question, need help, or found a bug? Email us. If you're reporting an issue, tell us what happened and attach a screenshot if you can.
            </p>
            <a href={`mailto:${SUPPORT_EMAIL}`} className="mt-3 block t-body underline">
              {SUPPORT_EMAIL}
            </a>
            <p className="mt-3 mb-0 t-meta text-[var(--grey)]">App {APP_VERSION}</p>
          </div>
        ) : null}
      </section>

      <AccountChapter number="03" title="Your data" />
      <section className="border-b border-[var(--rule)] py-[18px]">
        <a
          href="/api/account/export"
          className="flex w-full items-center border-0 bg-transparent p-0 text-left no-underline [-webkit-tap-highlight-color:transparent]"
        >
          <span className="t-label">Download data</span>
          <Download aria-hidden className="ml-auto size-5 text-[var(--ink)]" strokeWidth={1.5} />
        </a>
      </section>
      <p className="mb-[18px] mt-8 text-center">
        <Link href="/account/delete" className="t-body text-[var(--ink)]">
          Delete account
        </Link>
      </p>
      {linkCardId ? (
        <NewLinkDialog
          cardId={linkCardId}
          open
          busy={linkBusy}
          onYes={confirmNewLink}
          onClose={() => setLinkCardId(null)}
        />
      ) : null}
    </ProfileShell>
  );
}

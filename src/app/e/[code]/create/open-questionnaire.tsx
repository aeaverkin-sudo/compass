"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { CardEditList, type ScaffoldZone } from "@main/components/card-edit-list";
import { useMainLayout } from "@main/hooks/use-main-layout";
import {
  CARD_HEADER_PAD_PX,
  CARD_TOP_TRIM_PX,
  HEADER_FADE_PX,
  HERO_PHOTO_PX,
  RULE_GAP_PX,
  SCREEN_TOP_AXIS_PX,
  SECTION_PAD_PX,
  SHEET_INSET,
} from "@main/layout";
import { MarkPlus } from "@/shared/components/mark-plus";
import { PhotoSlotPicker } from "@landing/components/photo-slot-picker";
import { HeroName } from "@/shared/components/hero-name";
import { ScreenHeader } from "@/shared/components/screen-header";
import { TapButton } from "@/shared/components/tap-button";
import { useSessionBootstrap } from "@/shared/hooks/use-session-bootstrap";
import { HEADER_ROW_PX, VALUE_AXIS_PX } from "@/shared/layout/axes";
import { clearRegisteredDevice, markRegisteredDevice } from "@/shared/lib/registered-device";
import { clearRegistrationRequired, ignoreNextSignedOut } from "@/shared/lib/session-bootstrap";
import { cardHasPhoto, cardPhotoSrc } from "@/shared/services/card-photo";
import { uploadAttachment } from "@/shared/services/attachment-upload";
import { hydrateCardsFromServer } from "@/shared/services/card-sync";
import { recordConsent } from "@/shared/services/consent-client";
import { setSignupDrafting } from "@/shared/services/signup-gate";
import { createBrowserSupabaseClient } from "@/shared/lib/supabase/browser";
import { useAppStore } from "@/shared/store/app-store";
import type { Card, ContactItem } from "@/shared/types";

const SKY =
  "inline-block border-0 bg-sky px-[21.6px] py-[10.8px] text-center t-caps text-[var(--ink)] disabled:text-[var(--grey)] disabled:opacity-100 [-webkit-tap-highlight-color:transparent]";
const CARD_PAD = "px-[calc(clamp(24px,6.1vw,28px)-3mm)]";
/** The shelves of an empty portfolio. Hints only, until a line is written. */
const STARTERS: ScaffoldZone[] = [
  { id: "position", title: "Position", hint: "What you do" },
  { id: "web", title: "Web", hint: "Website" },
  { id: "social", title: "Social", hint: "Instagram, LinkedIn…" },
  { id: "files", title: "Files", hint: "PDF, JPG…" },
  { id: "about", title: "About", hint: "A line about you" },
];

const PASSWORD_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
let issuedFormPassword = "";
const passwordListeners = new Set<() => void>();

function formPassword() {
  return issuedFormPassword;
}

function subscribeFormPassword(listener: () => void) {
  passwordListeners.add(listener);
  return () => passwordListeners.delete(listener);
}

function issueFormPassword() {
  if (issuedFormPassword) return;
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  let raw = "";
  for (const byte of bytes) raw += PASSWORD_ALPHABET[byte % PASSWORD_ALPHABET.length] ?? "A";
  issuedFormPassword = `${raw.slice(0, 4)}-${raw.slice(4)}`;
  passwordListeners.forEach((listener) => listener());
}

function rememberLabels(cardId: string) {
  const card = useAppStore.getState().cards.find((entry) => entry.id === cardId);
  if (!card) return;
  for (const zone of STARTERS) {
    if (card.rubricLabels?.[zone.id]?.trim()) continue;
    useAppStore.getState().setRubricLabel(cardId, zone.id, zone.title);
  }
}

function zoneRows(card: Card, items: ContactItem[]) {
  const order = card.rubricOrder?.length ? card.rubricOrder : STARTERS.map((zone) => zone.id);
  const seen = new Set(order);
  const ids = [...order, ...Object.keys(card.rubricLabels ?? {}).filter((id) => !seen.has(id))];
  return ids.map((id) => ({
    id,
    title: card.rubricLabels?.[id]?.trim() || STARTERS.find((zone) => zone.id === id)?.title || id,
    rows: card.contactItemIds
      .filter((itemId) => card.itemZones?.[itemId] === id)
      .map((itemId) => items.find((item) => item.id === itemId)?.value.trim() ?? "")
      .filter(Boolean),
  }));
}

function requestedNext() {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("next") ?? "";
}

export function OpenPortfolio({
  lookup = "",
  hash = "",
  guest = null,
  account = false,
  sourceToken = null,
}: {
  lookup?: string;
  hash?: string;
  guest?: { token: string; name: string; email: string } | null;
  /** A signed-in site account that does not have a portfolio yet. */
  account?: boolean;
  /** Public card this person was viewing. Saved into their network once the portfolio exists. */
  sourceToken?: string | null;
}) {
  const router = useRouter();
  const layout = useMainLayout();
  const sessionReady = useSessionBootstrap();
  const [cardId, setCardId] = useState<string | null>(null);
  const [opening, setOpening] = useState(account);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [offerEmail, setOfferEmail] = useState<string | null>(null);
  const [offerName, setOfferName] = useState("");
  const [nameLive, setNameLive] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [emailDraft, setEmailDraft] = useState("");
  const [emailLive, setEmailLive] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(true);
  const password = useSyncExternalStore(subscribeFormPassword, formPassword, () => "");
  const openAddRef = useRef<(() => void) | null>(null);
  const photoFile = useRef<File | null>(null);
  const finished = useRef(false);
  const hadSession = useRef(false);
  const tempId = useRef<string | null>(null);
  void hash;
  useEffect(() => {
    issueFormPassword();
  }, []);
  const ran = useRef(false);
  const seeded = useRef(false);
  const eventPath = account || !lookup ? "/" : `/e/${encodeURIComponent(lookup)}`;
  const guestToken = guest?.token ?? null;
  const signInTo = sourceToken
    ? `/register?signin=1&card=${encodeURIComponent(sourceToken)}`
    : lookup
      ? `/register?signin=1&next=${encodeURIComponent(
          guestToken
            ? `/e/${encodeURIComponent(lookup)}?g=${encodeURIComponent(guestToken)}&go=1`
            : `/e/${encodeURIComponent(lookup)}/join`,
        )}`
      : "/register?signin=1";
  const card = useAppStore((state) => (cardId ? state.cards.find((entry) => entry.id === cardId) ?? null : null));
  const updateCard = useAppStore((state) => state.updateCard);
  const nameValue = nameLive ? nameDraft : card?.displayName || offerName;
  const nameReady = Boolean(nameValue.trim());
  const emailShown = emailLive ? emailDraft : (offerEmail ?? "");
  const emailPending = Boolean(offerEmail) && !emailLive;
  const emailReady = Boolean(emailShown.trim());
  const ready = nameReady && emailReady;
  const namePending = Boolean(offerName && !nameLive && !card?.displayName.trim());

  useEffect(() => {
    return () => {
      if (finished.current) return;
      setSignupDrafting(false);
      if (!hadSession.current) {
        useAppStore.getState().resetApp();
        return;
      }
      const id = tempId.current;
      const state = useAppStore.getState();
      const keep = new Set(
        state.cards.filter((entry) => entry.id !== id).flatMap((entry) => entry.contactItemIds),
      );
      useAppStore.setState({
        signupDraft: false,
        cards: id ? state.cards.filter((entry) => entry.id !== id) : state.cards,
        contactItems: state.contactItems.filter((item) => keep.has(item.id) || item.syncedOwner),
      });
      void hydrateCardsFromServer();
    };
  }, []);

  useEffect(() => {
    if (!sessionReady || ran.current) return;
    ran.current = true;
    void (async () => {
      const supabase = createBrowserSupabaseClient();
      const { data } = await supabase.auth.getUser();
      const user = data.user;
      const signedIn = Boolean(user && !user.is_anonymous);
      hadSession.current = signedIn;
      if (account && !signedIn) {
        router.replace("/register");
        return;
      }
      if (account && user) {
        await hydrateCardsFromServer();
        const owned = useAppStore.getState().cards;
        if (owned.some((entry) => entry.displayName.trim() || entry.photoAttachmentId || entry.photo)) {
          finished.current = true;
          router.replace("/main");
          return;
        }
        const email = (user.email ?? "").trim().toLowerCase();
        if (email) setOfferEmail(email);
      } else if (!signedIn) {
        useAppStore.getState().resetApp();
      }
      if (!account && guest?.name?.trim()) setOfferName(guest.name.trim());
      if (!account && guest?.email?.trim()) setOfferEmail(guest.email.trim().toLowerCase());
      setSignupDrafting(true);
      useAppStore.setState({ signupDraft: true });
      const state = useAppStore.getState();
      state.updateSecondCardDraft({ displayName: "" }, state.cards.length + 1);
      const id = useAppStore.getState().cards.at(-1)?.id ?? null;
      if (!id) {
        setOpening(false);
        setMessage("Could not open your portfolio.");
        return;
      }
      tempId.current = id;
      if (!seeded.current) {
        seeded.current = true;
        rememberLabels(id);
      }
      setCardId(id);
      setOpening(false);
    })().catch(() => {
      setOpening(false);
      setMessage("Could not open your portfolio.");
    });
  }, [account, guest, router, sessionReady]);

  const scaffold = STARTERS;

  const finish = async () => {
    if (busy || !cardId || !ready) return;
    const email = emailShown.trim().toLowerCase();
    const title = nameValue.trim();
    if (!email || !title) return;
    setBusy(true);
    setMessage(null);
    const state = useAppStore.getState();
    const named = state.cards.find((entry) => entry.id === cardId);
    if (named && named.displayName !== title) {
      useAppStore.getState().updateCard(cardId, { displayName: title });
    }
    const fresh = useAppStore.getState();
    const saved = fresh.cards.find((entry) => entry.id === cardId);
    const body = {
      ...(account ? {} : { email, password }),
      card: {
        displayName: title,
        rubricOrder: saved?.rubricOrder ?? STARTERS.map((zone) => zone.id),
        rubricLabels: saved?.rubricLabels ?? {},
        zones: saved ? zoneRows(saved, fresh.contactItems) : [],
      },
      ...(lookup ? { event: { lookup, guestToken } } : {}),
      ...(sourceToken ? { sourceToken } : {}),
      ...(requestedNext() ? { next: requestedNext() } : {}),
    };
    try {
      const response = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const reply = (await response.json().catch(() => ({}))) as {
        cardId?: string;
        next?: string;
        kind?: string;
        error?: string;
      };
      if (response.status === 409 || reply.kind === "login") {
        setMessage("This email already has an account.");
        setBusy(false);
        return;
      }
      if (!response.ok || !reply.cardId) {
        setMessage(reply.error ?? "Could not create your profile.");
        setBusy(false);
        return;
      }
      finished.current = true;
      const file = photoFile.current;
      const go = reply.next || "/main";
      if (account) {
        setSignupDrafting(false);
        const live = useAppStore.getState();
        const keep = new Set(
          live.cards.filter((entry) => entry.id !== cardId).flatMap((entry) => entry.contactItemIds),
        );
        useAppStore.setState({
          signupDraft: false,
          cards: live.cards.filter((entry) => entry.id !== cardId),
          contactItems: live.contactItems.filter((item) => keep.has(item.id) || item.syncedOwner),
        });
        await hydrateCardsFromServer();
      } else {
        const supabase = createBrowserSupabaseClient();
        useAppStore.getState().resetApp();
        clearRegisteredDevice();
        ignoreNextSignedOut();
        await supabase.auth.signOut({ scope: "local" });
        const signed = await supabase.auth.signInWithPassword({ email, password });
        if (signed.error || !signed.data.session) {
          setMessage("Could not open your profile.");
          setBusy(false);
          return;
        }
        markRegisteredDevice();
        clearRegistrationRequired();
        await recordConsent("register").catch(() => undefined);
        useAppStore.setState({ ownerId: signed.data.user?.id ?? null });
        await hydrateCardsFromServer();
        await fetch("/api/account/welcome", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cardId: reply.cardId, password }),
        }).catch(() => undefined);
      }
      if (file) {
        const uploaded = await uploadAttachment({ file, kind: "card-photo", cardId: reply.cardId }).catch(() => null);
        if (uploaded) {
          await fetch(`/api/cards/${reply.cardId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ photoAttachmentId: uploaded.attachmentId }),
          }).catch(() => undefined);
        }
      }
      router.replace(go);
    } catch {
      setMessage("Could not create your profile.");
      setBusy(false);
    }
  };

  if (opening) {
    return (
      <main className="compass-main fixed inset-0 flex items-center justify-center bg-background" aria-busy="true">
        <p className="t-meta text-[var(--ink)]">…</p>
      </main>
    );
  }

  const scale = layout?.headerScale ?? 1;
  const photoPx = HERO_PHOTO_PX * scale;
  const inset = layout?.edgeInsetBrowse ?? SHEET_INSET.browse.horizontal;
  const headerPad = `calc(env(safe-area-inset-top) + ${SCREEN_TOP_AXIS_PX}px - ${HEADER_ROW_PX / 2}px + ${HEADER_ROW_PX}px)`;

  return (
    <main className="compass-main fixed inset-0 flex flex-col overflow-hidden bg-background text-[var(--ink)]">
      <ScreenHeader title="Create your portfolio" fallbackHref={eventPath} spacer={false} />
      <div className="shrink-0 bg-background" style={{ paddingTop: headerPad, paddingLeft: inset, paddingRight: inset }}>
        <div className={CARD_PAD}>
          <div
            className="relative"
            style={{
              paddingTop: (RULE_GAP_PX - CARD_TOP_TRIM_PX) * scale,
              paddingBottom: CARD_HEADER_PAD_PX * scale,
            }}
          >
            <div className="flex shrink-0 items-stretch gap-3" style={{ height: photoPx }}>
              {card ? (
                <PhotoSlotPicker
                  photo={cardHasPhoto(card) ? cardPhotoSrc(card) : null}
                  photoLook={cardHasPhoto(card) ? card.photoLook : "shadow"}
                  emptyMark={
                    <span className="t-caps px-1 text-center leading-[1.15] text-[var(--grey)]">
                      Add
                      <br />
                      photo
                    </span>
                  }
                  onPhotoChange={(photo, file) => {
                    if (!photo || !file) {
                      photoFile.current = null;
                      updateCard(card.id, { photo: undefined, photoAttachmentId: undefined });
                      return;
                    }
                    photoFile.current = file;
                    updateCard(card.id, { photo, photoLook: card.photoLook ?? "shadow" });
                  }}
                  sizePx={photoPx}
                  borderRadiusPx={0}
                  surfaceClassName="bg-transparent"
                />
              ) : null}
              <div className="relative flex h-full min-w-0 flex-1 flex-col">
                {card ? (
                  <>
                    <HeroName
                      value={nameValue}
                      placeholder={"NAME, COMPANY\nOR PORTFOLIO TITLE *"}
                      pending={namePending}
                      onFocus={() => {
                        setNameLive(true);
                        setNameDraft((current) => current || card.displayName || offerName);
                      }}
                      onChange={(displayName) => {
                        setNameLive(true);
                        setNameDraft(displayName);
                        updateCard(card.id, { displayName });
                      }}
                    />
                  </>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div
        className="compass-card-scroll min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain"
        style={{
          paddingBottom: "max(12px, env(safe-area-inset-bottom))",
          scrollPaddingTop: headerPad,
          scrollPaddingBottom: "var(--vv-bottom, 0px)",
          WebkitMaskImage: `linear-gradient(to bottom, transparent 0, #000 ${HEADER_FADE_PX}px)`,
          maskImage: `linear-gradient(to bottom, transparent 0, #000 ${HEADER_FADE_PX}px)`,
        }}
      >
        <div style={{ marginTop: -(SECTION_PAD_PX - HEADER_FADE_PX), paddingLeft: inset, paddingRight: inset }}>
          <div className={CARD_PAD}>
          {card ? (
            <CardEditList card={card} items={[]} scaffold={scaffold} openAddRef={openAddRef} />
          ) : null}
          {card ? (
            <div className="grid grid-cols-[86px_minmax(0,1fr)] items-center gap-x-[14px] border-t border-[var(--rule)] py-[18px]">
              <span />
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  aria-label="Add"
                  className="flex border-0 bg-transparent p-0 text-[var(--ink)]"
                  onPointerUp={() => openAddRef.current?.()}
                >
                  <MarkPlus />
                </button>
                <p className="m-0 t-meta text-[var(--grey)]">No rush — add the rest anytime later.</p>
              </div>
            </div>
          ) : null}
          </div>
        </div>
        {card ? (
          <div className="bg-sky py-[18px]">
            <div style={{ paddingLeft: inset, paddingRight: inset }}>
            <div className={CARD_PAD}>
              <div className="grid grid-cols-[86px_minmax(0,1fr)] items-center gap-x-[14px]">
                <span className="t-label">Email *</span>
                <input
                  type="email"
                  inputMode="email"
                  autoCapitalize="none"
                  autoComplete="email"
                  aria-label="Email"
                  placeholder="name@mail.com"
                  value={emailShown}
                  onFocus={() => {
                    setEmailLive(true);
                    setEmailDraft((current) => current || offerEmail || "");
                  }}
                  onChange={(event) => {
                    setEmailLive(true);
                    setEmailDraft(event.target.value);
                  }}
                  className={`compass-input block w-full border-0 border-b border-[var(--rule)] bg-transparent px-0 py-1 t-body caret-[var(--ink)] outline-none placeholder:text-[var(--placeholder)] ${emailPending ? "text-[var(--placeholder)]" : "text-[var(--ink)]"}`}
                />
              </div>
              {account ? null : (
                <div className="mt-[18px] grid grid-cols-[86px_minmax(0,1fr)] items-start gap-x-[14px]">
                  <span className="t-label pt-1">Password</span>
                  <div>
                    <div className="flex items-center gap-2 border-b border-[var(--rule)]">
                      <input
                        type={passwordVisible ? "text" : "password"}
                        autoCapitalize="none"
                        autoComplete="new-password"
                        aria-label="Password"
                        readOnly
                        value={password}
                        className="compass-input block min-w-0 flex-1 border-0 bg-transparent p-0 py-1 t-body text-[var(--ink)] outline-none"
                      />
                      <button
                        type="button"
                        aria-label={passwordVisible ? "Hide password" : "Show password"}
                        className="border-0 bg-transparent p-1 text-[var(--ink)]"
                        onClick={() => setPasswordVisible((shown) => !shown)}
                      >
                        {passwordVisible ? <Eye className="size-4" strokeWidth={1.5} /> : <EyeOff className="size-4" strokeWidth={1.5} />}
                      </button>
                    </div>
                    <p className="mt-2 mb-0 t-meta text-[var(--grey)]">You can change it anytime in Profile.</p>
                  </div>
                </div>
              )}
            </div>
            </div>
          </div>
        ) : null}
        <div style={{ paddingLeft: inset, paddingRight: inset }}>
        <div className={CARD_PAD}>
          {message ? <p className="mt-4 mb-0 t-meta text-[var(--ink)]">{message}</p> : null}
          <div className="py-[18px]" style={{ paddingLeft: VALUE_AXIS_PX }}>
            <TapButton disabled={busy || !card || !ready || !sessionReady} onTap={() => void finish()} className={SKY}>
              Create portfolio
            </TapButton>
            {!ready && card ? (
              <p className="mt-2 mb-0 t-meta text-[var(--grey)]">
                {nameReady ? "Add your email to continue." : "Add a title and your email to continue."}
              </p>
            ) : null}
            {account ? null : (
              <p className="mt-4 mb-0 t-meta text-[var(--grey)]">
                Already have an account?{" "}
                <a href={signInTo} className="text-[var(--grey)] underline">
                  Sign in
                </a>
              </p>
            )}
          </div>
          <div className="h-8" />
        </div>
        </div>
      </div>
    </main>
  );
}

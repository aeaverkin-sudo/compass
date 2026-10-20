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
import { markRegisteredDevice } from "@/shared/lib/registered-device";
import { clearRegistrationRequired, ignoreNextSignedOut } from "@/shared/lib/session-bootstrap";
import { cardHasPhoto, cardPhotoSrc } from "@/shared/services/card-photo";
import { uploadAttachment } from "@/shared/services/attachment-upload";
import { scheduleCardUpsert, hydrateCardsFromServer, upsertCardScalars } from "@/shared/services/card-sync";
import { syncCardLinkOrder } from "@/shared/services/card-items-sync";
import { findIdenticalItem } from "@/shared/services/contact-item";
import { recordConsent } from "@/shared/services/consent-client";
import { createBrowserSupabaseClient } from "@/shared/lib/supabase/browser";
import { useAppStore } from "@/shared/store/app-store";
import { dropDraft, readDraft, writeDraft } from "./draft";

const SKY =
  "inline-block border-0 bg-sky px-[21.6px] py-[10.8px] text-center t-caps text-[var(--ink)] disabled:text-[var(--grey)] disabled:opacity-100 [-webkit-tap-highlight-color:transparent]";
const CARD_PAD = "px-[calc(clamp(24px,6.1vw,28px)-3mm)]";
const EXPIRED = "This link has expired. Enter your email again.";

/** The shelves of an empty portfolio. Hints only, until a line is written. */
const STARTERS: ScaffoldZone[] = [
  { id: "position", title: "Position", hint: "What you do", required: true },
  { id: "company", title: "Company", hint: "Company or business", required: true },
  { id: "web", title: "Web", hint: "Website" },
  { id: "social", title: "Social", hint: "Instagram, LinkedIn…" },
  { id: "files", title: "Files", hint: "PDF, JPG…" },
  { id: "contact", title: "Contacts", hint: "Email, phone…" },
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

async function portfolioLimit(): Promise<number | null> {
  const response = await fetch("/api/account/status", { cache: "no-store" });
  if (!response.ok) return null;
  const status = (await response.json()) as { portfolioLimit?: number };
  return typeof status.portfolioLimit === "number" ? status.portfolioLimit : null;
}

function rememberLabels(cardId: string) {
  const card = useAppStore.getState().cards.find((entry) => entry.id === cardId);
  if (!card) return;
  for (const zone of STARTERS) {
    if (card.rubricLabels?.[zone.id]?.trim()) continue;
    useAppStore.getState().setRubricLabel(cardId, zone.id, zone.title);
  }
}

function offeredPersonName(meta: unknown): string {
  if (!meta || typeof meta !== "object") return "";
  const row = meta as Record<string, unknown>;
  const direct = row.full_name ?? row.name;
  if (typeof direct === "string" && direct.trim()) return direct.trim();
  const given = typeof row.given_name === "string" ? row.given_name.trim() : "";
  const family = typeof row.family_name === "string" ? row.family_name.trim() : "";
  return [given, family].filter(Boolean).join(" ");
}

function hasZone(
  card: { contactItemIds: string[]; itemZones?: Record<string, string> },
  items: { id: string; value: string }[],
  zoneId: string,
) {
  return card.contactItemIds.some((id) => {
    const item = items.find((entry) => entry.id === id);
    return Boolean(item?.value.trim()) && card.itemZones?.[id] === zoneId;
  });
}

/** Puts the account email on Contacts. Returns the library row. */
function placeContact(cardId: string, email: string): string | null {
  const value = email.trim().toLowerCase();
  if (!value) return null;
  const state = useAppStore.getState();
  const card = state.cards.find((entry) => entry.id === cardId);
  if (!card) return null;
  const present = card.contactItemIds.find((id) => {
    const item = state.contactItems.find((entry) => entry.id === id);
    return item?.value.trim().toLowerCase() === value;
  });
  if (present) return present;
  let id = findIdenticalItem(state.contactItems, value)?.id ?? null;
  if (!id) {
    id = state.addContactItem();
    if (!id) return null;
    useAppStore.getState().updateContactItem(id, { value });
  }
  useAppStore.getState().addItemToCard(cardId, id, "contact");
  return id;
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
  const [opening, setOpening] = useState(Boolean(hash) || account);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  /** Grey Contacts hint. A real row is written only on Create portfolio. */
  const [offerEmail, setOfferEmail] = useState<string | null>(null);
  /** Grey header name. It is written onto the card when the caret lands, or on Create portfolio. */
  const [offerName, setOfferName] = useState("");
  const [nameLive, setNameLive] = useState(false);
  const [emailDraft, setEmailDraft] = useState("");
  const [emailLive, setEmailLive] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(true);
  const password = useSyncExternalStore(subscribeFormPassword, formPassword, () => "");
  const openAddRef = useRef<(() => void) | null>(null);
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
  const contactItems = useAppStore((state) => state.contactItems);
  const updateCard = useAppStore((state) => state.updateCard);
  const nameValue = card?.displayName || (nameLive ? "" : offerName);
  const nameReady = Boolean(nameValue.trim());
  const positionReady = Boolean(card && hasZone(card, contactItems, "position"));
  const companyReady = Boolean(card && hasZone(card, contactItems, "company"));
  const emailShown = emailLive ? emailDraft : (offerEmail ?? "");
  const emailPending = Boolean(offerEmail) && !emailLive;
  const emailReady = Boolean(emailShown.trim());
  const passwordReady = account || password.length >= 8;
  const ready = nameReady && positionReady && companyReady && emailReady && passwordReady;
  const namePending = Boolean(offerName && !nameLive && !card?.displayName.trim());

  useEffect(() => {
    if (!sessionReady || ran.current) return;
    ran.current = true;
    void (async () => {
      const supabase = createBrowserSupabaseClient();
      if (account) {
        const { data } = await supabase.auth.getUser();
        const user = data.user;
        if (!user || user.is_anonymous) {
          router.replace("/register");
          return;
        }
        await hydrateCardsFromServer();
        const owned = useAppStore.getState().cards;
        if (owned.some((entry) => entry.displayName.trim() || entry.photoAttachmentId || entry.photo)) {
          router.replace("/main");
          return;
        }
        const email = (user.email ?? "").trim().toLowerCase();
        if (email) setOfferEmail(email);
        const given = offeredPersonName(user.user_metadata);
        if (given) setOfferName(given);
        let id: string | null = owned.find((entry) => !entry.displayName.trim() && !entry.photoAttachmentId && !entry.photo)?.id ?? null;
        if (!id) {
          const limit = await portfolioLimit();
          const state = useAppStore.getState();
          const room = limit ?? 1;
          if (state.cards.length < room) {
            state.updateSecondCardDraft({ displayName: "" }, room);
            id = useAppStore.getState().cards[useAppStore.getState().cards.length - 1]?.id ?? null;
          }
        }
        if (!id) {
          setOpening(false);
          setMessage("You're at 3 portfolios — this one wasn't added");
          return;
        }
        if (!seeded.current) {
          seeded.current = true;
          rememberLabels(id);
        }
        setCardId(id);
        setOpening(false);
        return;
      }
      if (hash) {
        const signed = await supabase.auth.verifyOtp({ token_hash: hash, type: "magiclink" });
        if (signed.error) {
          setOpening(false);
          setMessage(EXPIRED);
          return;
        }
        markRegisteredDevice();
        clearRegistrationRequired();
        await hydrateCardsFromServer();
        const existing = useAppStore.getState().cards[0]?.id ?? null;
        if (existing) {
          let pay = false;
          try {
            const joined = await fetch(`/api/events/${encodeURIComponent(lookup)}/register`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ cardId: existing, ...(guestToken ? { token: guestToken } : {}) }),
            });
            const body = (await joined.json().catch(() => ({}))) as { pay?: boolean };
            pay = body.pay === true;
          } catch {
            /* the event page still registers later */
          }
          dropDraft(lookup, guestToken);
          router.replace(pay ? `${eventPath}/join` : "/main");
          return;
        }
      }
      let { data } = await supabase.auth.getUser();
      if (!data.user) {
        const anon = await supabase.auth.signInAnonymously();
        data = { user: anon.data.user };
      }
      const user = data.user;
      if (!user) {
        setOpening(false);
        setMessage("Could not open your portfolio.");
        return;
      }
      const draft = readDraft(lookup, guestToken);
      const email = (guest?.email || draft?.email || (!user.is_anonymous ? user.email : "") || "").trim().toLowerCase();
      const offered = (guest?.name?.trim() || draft?.name || (!user.is_anonymous ? offeredPersonName(user.user_metadata) : "")).trim();
      if (offered) setOfferName(offered);
      if (email) {
        setOfferEmail(email);
        writeDraft(lookup, guestToken, { email, website: draft?.website ?? "", name: offered });
      }
      let id: string | null = useAppStore.getState().cards[0]?.id ?? null;
      if (!id) {
        const limit = await portfolioLimit();
        const state = useAppStore.getState();
        const room = limit ?? 1;
        if (state.cards.length < room) {
          state.updateSecondCardDraft({ displayName: "" }, room);
          id = useAppStore.getState().cards[useAppStore.getState().cards.length - 1]?.id ?? null;
        }
      }
      if (!id) {
        setOpening(false);
        setMessage("You're at 3 portfolios — this one wasn't added");
        return;
      }
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
  }, [account, eventPath, guest, guestToken, hash, lookup, router, sessionReady]);

  const scaffold = STARTERS;

  const finish = async () => {
    if (busy || !cardId || !ready) return;
    const offered = offerName.trim();
    const named = useAppStore.getState().cards.find((entry) => entry.id === cardId);
    if (named && !named.displayName.trim() && offered) {
      useAppStore.getState().updateCard(cardId, { displayName: offered });
    }
    const email = emailShown.trim().toLowerCase();
    if (!lookup && !account) {
      if (!email) {
        setMessage("Add your email.");
        return;
      }
      setBusy(true);
      setMessage(null);
      placeContact(cardId, email);
      const supabase = createBrowserSupabaseClient();
      const send = () =>
        fetch("/api/account/portfolio", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
      try {
        let response = await send();
        if (response.status === 401) {
          await supabase.auth.signInAnonymously();
          response = await send();
        }
        const reply = (await response.json().catch(() => ({}))) as {
          kind?: "created" | "login" | "go";
          next?: string;
          error?: string;
        };
        if (!response.ok || !reply.kind) {
          setMessage(reply.error ?? "Could not create your profile.");
          setBusy(false);
          return;
        }
        if (reply.kind === "login") {
          setMessage("This email already has an account.");
          setBusy(false);
          return;
        }
        if (reply.kind === "go" && reply.next) {
          if (sourceToken) {
            await fetch("/api/network/save", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ token: sourceToken }),
            }).catch(() => undefined);
          }
          window.location.assign(reply.next);
          return;
        }
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
        const state = useAppStore.getState();
        const saved = state.cards.find((entry) => entry.id === cardId);
        if (saved) {
          await upsertCardScalars(saved);
          scheduleCardUpsert(saved);
          const items = state.contactItems.filter((item) => saved.contactItemIds.includes(item.id));
          await syncCardLinkOrder(saved, items).catch(() => undefined);
        }
        await fetch("/api/account/welcome", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cardId, password }),
        }).catch(() => undefined);
        if (sourceToken) {
          await fetch("/api/network/save", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token: sourceToken }),
          }).catch(() => undefined);
        }
        const user = useAppStore.getState().user;
        if (!user.onboarded) useAppStore.setState({ user: { ...user, onboarded: true } });
        router.replace("/main");
      } catch {
        setMessage("Could not create your profile.");
        setBusy(false);
      }
      return;
    }
    if (account) {
      setBusy(true);
      setMessage(null);
      const email = (offerEmail ?? "").trim().toLowerCase();
      if (email) placeContact(cardId, email);
      const state = useAppStore.getState();
      const saved = state.cards.find((entry) => entry.id === cardId);
      if (saved) {
        scheduleCardUpsert(saved);
        const items = state.contactItems.filter((item) => saved.contactItemIds.includes(item.id));
        await syncCardLinkOrder(saved, items).catch(() => undefined);
      }
      if (sourceToken) {
        await fetch("/api/network/save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: sourceToken }),
        }).catch(() => undefined);
      }
      const user = useAppStore.getState().user;
      if (!user.onboarded) useAppStore.setState({ user: { ...user, onboarded: true } });
      router.replace("/main");
      return;
    }
    if (!email) {
      setMessage("Add your email.");
      return;
    }
    setBusy(true);
    setMessage(null);
    placeContact(cardId, email);
    const draft = readDraft(lookup, guestToken);
    const supabase = createBrowserSupabaseClient();
    const send = () =>
      fetch(`/api/events/${encodeURIComponent(lookup)}/portfolio`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          website: draft?.website ?? "",
          ...(guestToken ? { guestToken } : {}),
        }),
      });
    try {
      const { data: current } = await supabase.auth.getUser();
      const signedIn = Boolean(current.user && !current.user.is_anonymous);
      if (!signedIn) {
        let response = await send();
        if (response.status === 401) {
          await supabase.auth.signInAnonymously();
          response = await send();
        }
        const reply = (await response.json().catch(() => ({}))) as {
          kind?: "created" | "mailed" | "go";
          next?: string;
          email?: string;
          password?: string;
          error?: string;
        };
        if (!response.ok || !reply.kind) {
          setMessage(reply.error ?? "Could not create your profile.");
          setBusy(false);
          return;
        }
        if (reply.kind === "go" && reply.next) {
          window.location.assign(reply.next);
          return;
        }
        if (reply.kind === "mailed") {
          setSentTo(reply.email ?? email);
          setBusy(false);
          return;
        }
        ignoreNextSignedOut();
        await supabase.auth.signOut({ scope: "local" });
        const signed = await supabase.auth.signInWithPassword({ email, password: reply.password || password });
        if (signed.error || !signed.data.session) {
          setMessage("Could not open your profile.");
          setBusy(false);
          return;
        }
        markRegisteredDevice();
        clearRegistrationRequired();
        await recordConsent("register").catch(() => undefined);
        const state = useAppStore.getState();
        const card = state.cards.find((entry) => entry.id === cardId);
        if (card) {
          await upsertCardScalars(card);
          scheduleCardUpsert(card);
          const items = state.contactItems.filter((item) => card.contactItemIds.includes(item.id));
          await syncCardLinkOrder(card, items).catch(() => undefined);
        }
        const mailedPassword = reply.password || password;
        if (mailedPassword) {
          await fetch(`/api/events/${encodeURIComponent(lookup)}/portfolio/welcome`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ cardId, password: mailedPassword }),
          }).catch(() => undefined);
        }
      } else {
        const state = useAppStore.getState();
        const card = state.cards.find((entry) => entry.id === cardId);
        if (card) {
          scheduleCardUpsert(card);
          const items = state.contactItems.filter((item) => card.contactItemIds.includes(item.id));
          await syncCardLinkOrder(card, items).catch(() => undefined);
        }
      }
      let pay = false;
      try {
        const joined = await fetch(`/api/events/${encodeURIComponent(lookup)}/register`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cardId, ...(guestToken ? { token: guestToken } : {}) }),
        });
        const body = (await joined.json().catch(() => ({}))) as { pay?: boolean };
        pay = body.pay === true;
      } catch {
        /* the event page still registers later */
      }
      dropDraft(lookup, guestToken);
      router.replace(pay ? `${eventPath}/join` : "/main");
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
      <ScreenHeader title="Create a portfolio" fallbackHref={eventPath} spacer={false} />
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
                      updateCard(card.id, { photo: undefined, photoAttachmentId: undefined });
                      return;
                    }
                    updateCard(card.id, { photo, photoLook: card.photoLook ?? "shadow" });
                    void uploadAttachment({ file, kind: "card-photo", cardId: card.id })
                      .then((uploaded) => updateCard(card.id, { photoAttachmentId: uploaded.attachmentId }))
                      .catch(() => setMessage("Could not save the photo."));
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
                      placeholder="NAME OR PORTFOLIO TITLE *"
                      pending={namePending}
                      onFocus={() => {
                        setNameLive(true);
                        if (!card.displayName.trim() && offerName.trim()) {
                          updateCard(card.id, { displayName: offerName.trim() });
                        }
                      }}
                      onChange={(displayName) => {
                        setNameLive(true);
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
          {sentTo ? (
            <p className="mt-4 mb-0 t-meta text-[var(--grey)]">{`Check ${sentTo}. Open the link in the email to sign in and join.`}</p>
          ) : null}
          {message ? <p className="mt-4 mb-0 t-meta text-[var(--ink)]">{message}</p> : null}
          <div className="py-[18px]" style={{ paddingLeft: VALUE_AXIS_PX }}>
            <TapButton disabled={busy || !card || !ready || !sessionReady || Boolean(sentTo)} onTap={() => void finish()} className={SKY}>
              Create portfolio
            </TapButton>
            {!ready && card && !sentTo && !(nameReady && positionReady && companyReady && emailReady) ? (
              <p className="mt-2 mb-0 t-meta text-[var(--grey)]">
                {nameReady && positionReady && companyReady ? "Add your email." : "Fill name, position and company to continue."}
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

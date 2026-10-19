"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CardEditList, type ScaffoldZone } from "@main/components/card-edit-list";
import { useMainLayout } from "@main/hooks/use-main-layout";
import { CARD_HEADER_PAD_PX, CARD_TOP_TRIM_PX, HERO_PHOTO_PX, RULE_GAP_PX, SCREEN_TOP_AXIS_PX, SHEET_INSET } from "@main/layout";
import { PhotoSlotPicker } from "@landing/components/photo-slot-picker";
import { HeroName } from "@/shared/components/hero-name";
import { ScreenHeader } from "@/shared/components/screen-header";
import { TapButton } from "@/shared/components/tap-button";
import { useSessionBootstrap } from "@/shared/hooks/use-session-bootstrap";
import { HEADER_ROW_PX, VALUE_AXIS_PX } from "@/shared/layout/axes";
import { markRegisteredDevice } from "@/shared/lib/registered-device";
import { clearRegistrationRequired } from "@/shared/lib/session-bootstrap";
import { cardPhotoSrc } from "@/shared/services/card-photo";
import { uploadAttachment } from "@/shared/services/attachment-upload";
import { hydrateCardsFromServer } from "@/shared/services/card-sync";
import { findIdenticalItem } from "@/shared/services/contact-item";
import { createBrowserSupabaseClient } from "@/shared/lib/supabase/browser";
import { useAppStore } from "@/shared/store/app-store";
import { clearLocal } from "../invite-actions";

const PASS_KEY = "aded:cold-pass";
const SKY =
  "press inline-block border-0 bg-sky px-[21.6px] py-[10.8px] text-center t-caps text-[var(--ink)] disabled:text-[var(--grey)] [-webkit-tap-highlight-color:transparent]";
const CARD_PAD = "px-[calc(clamp(24px,6.1vw,28px)-3mm)]";
const EXPIRED = "This link has expired. Enter your email again.";

/** The seven shelves of an empty portfolio. Hints only, until a line is written. */
const STARTERS: ScaffoldZone[] = [
  { id: "company", title: "Company", hint: "Company or business name" },
  { id: "position", title: "Position", hint: "Your role" },
  { id: "web", title: "Web", hint: "Website" },
  { id: "social", title: "Social", hint: "Instagram, LinkedIn, Facebook…" },
  { id: "contact", title: "Contacts", hint: "Email, messenger, phone" },
  { id: "files", title: "Files", hint: "PDF, JPG, …" },
  { id: "about", title: "About", hint: "About you or your projects" },
];

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

export function OpenPortfolio({ lookup, hash }: { lookup: string; hash: string }) {
  const router = useRouter();
  const layout = useMainLayout();
  const sessionReady = useSessionBootstrap();
  const [cardId, setCardId] = useState<string | null>(null);
  const [opening, setOpening] = useState(Boolean(hash));
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** The account email, still grey, until the cursor lands in the row. */
  const [greyId, setGreyId] = useState<string | null>(null);
  const [offerEmail, setOfferEmail] = useState<string | null>(null);
  const openAddRef = useRef<(() => void) | null>(null);
  const ran = useRef(false);
  const seeded = useRef(false);
  const eventPath = `/e/${encodeURIComponent(lookup)}`;
  const card = useAppStore((state) => (cardId ? state.cards.find((entry) => entry.id === cardId) ?? null : null));
  const updateCard = useAppStore((state) => state.updateCard);

  useEffect(() => {
    if (!sessionReady || ran.current) return;
    ran.current = true;
    void (async () => {
      const supabase = createBrowserSupabaseClient();
      if (hash) {
        const signed = await supabase.auth.verifyOtp({ token_hash: hash, type: "magiclink" });
        if (signed.error) {
          setOpening(false);
          setMessage(EXPIRED);
          return;
        }
        clearLocal();
        markRegisteredDevice();
        clearRegistrationRequired();
        await hydrateCardsFromServer();
        if (useAppStore.getState().cards.length > 0) {
          router.replace("/main");
          return;
        }
      }
      const { data } = await supabase.auth.getUser();
      const user = data.user;
      if (!user || user.is_anonymous) {
        router.replace(eventPath);
        return;
      }
      await hydrateCardsFromServer();
      let id = useAppStore.getState().cards[0]?.id ?? null;
      if (!id) {
        const limit = await portfolioLimit();
        const state = useAppStore.getState();
        if (limit !== null && state.cards.length < limit) {
          state.updateSecondCardDraft({ displayName: "" }, limit);
          id = useAppStore.getState().cards[0]?.id ?? null;
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
        const accountEmail = user.email?.trim().toLowerCase() ?? "";
        const placed = accountEmail ? placeContact(id, accountEmail) : null;
        if (placed) setGreyId(placed);
        else if (accountEmail) setOfferEmail(accountEmail);
      }
      setCardId(id);
      setOpening(false);
    })().catch(() => {
      setOpening(false);
      setMessage("Could not open your portfolio.");
    });
  }, [eventPath, hash, router, sessionReady]);

  useEffect(() => {
    if (!greyId) return;
    const wake = (event: Event) => {
      const node = event.target;
      if (!(node instanceof Node)) return;
      const row = document.querySelector(`[data-item-row="${CSS.escape(greyId)}"]`);
      if (!row?.contains(node)) return;
      setGreyId(null);
    };
    document.addEventListener("pointerdown", wake, true);
    return () => document.removeEventListener("pointerdown", wake, true);
  }, [greyId]);

  const scaffold = useMemo(
    () =>
      offerEmail
        ? STARTERS.map((zone) => (zone.id === "contact" ? { ...zone, hint: offerEmail } : zone))
        : STARTERS,
    [offerEmail],
  );

  const finish = async () => {
    if (busy || !cardId) return;
    setBusy(true);
    setMessage(null);
    if (offerEmail) placeContact(cardId, offerEmail);
    let pay = false;
    try {
      const joined = await fetch(`/api/events/${encodeURIComponent(lookup)}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId }),
      });
      const body = (await joined.json().catch(() => ({}))) as { pay?: boolean };
      pay = body.pay === true;
    } catch {
      /* the event page still registers later */
    }
    let password = "";
    try {
      password = window.sessionStorage.getItem(PASS_KEY) ?? "";
      window.sessionStorage.removeItem(PASS_KEY);
    } catch {
      password = "";
    }
    if (password) {
      await fetch(`/api/events/${encodeURIComponent(lookup)}/portfolio/welcome`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId, password }),
      }).catch(() => undefined);
    }
    router.replace(pay ? `${eventPath}/join` : "/main");
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
      {greyId && /^[0-9a-zA-Z-]+$/.test(greyId) ? (
        <style>{`[data-item-row="${greyId}"]{color:var(--placeholder)!important}`}</style>
      ) : null}
      <ScreenHeader title="Create a portfolio" fallbackHref={eventPath} spacer={false} />
      <div className="shrink-0 bg-background" style={{ paddingTop: headerPad, paddingLeft: inset, paddingRight: inset }}>
        <div className={CARD_PAD}>
          <div
            className="border-b border-[var(--rule)]"
            style={{
              paddingTop: (RULE_GAP_PX - CARD_TOP_TRIM_PX) * scale,
              paddingBottom: CARD_HEADER_PAD_PX * scale,
            }}
          >
            <div className="flex shrink-0 items-stretch gap-3" style={{ height: photoPx }}>
              {card ? (
                <PhotoSlotPicker
                  photo={cardPhotoSrc(card)}
                  photoLook={card.photo ? card.photoLook : "shadow"}
                  emptyMark={<span className="t-caps px-1 text-center text-[var(--grey)]">Add photo</span>}
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
                  <HeroName
                    value={card.displayName}
                    placeholder="NAME OR PORTFOLIO TITLE"
                    onChange={(displayName) => updateCard(card.id, { displayName })}
                  />
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain" style={{ paddingLeft: inset, paddingRight: inset }}>
        <div className={CARD_PAD}>
          {card ? (
            <CardEditList card={card} items={[]} scaffold={scaffold} openAddRef={openAddRef} />
          ) : null}
          {card ? (
            <div className="grid grid-cols-[86px_minmax(0,1fr)] items-start gap-x-[14px] py-[18px]">
              <span />
              <button
                type="button"
                aria-label="Add"
                className="t-body w-full bg-transparent text-left text-[var(--ink)]"
                onPointerUp={() => openAddRef.current?.()}
              >
                +
              </button>
            </div>
          ) : null}
          {message ? <p className="mb-4 t-meta text-[var(--ink)]">{message}</p> : null}
        </div>
      </div>

      <div
        className="shrink-0 bg-background"
        style={{
          paddingLeft: inset,
          paddingRight: inset,
          paddingTop: 12,
          paddingBottom: "max(12px, env(safe-area-inset-bottom))",
        }}
      >
        <div className={CARD_PAD}>
          <div style={{ paddingLeft: VALUE_AXIS_PX }}>
            <TapButton disabled={busy || !card || !sessionReady} onTap={() => void finish()} className={SKY}>
              Create portfolio
            </TapButton>
          </div>
        </div>
      </div>
    </main>
  );
}

"use client";

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
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
import { uploadAttachment } from "@/shared/services/attachment-upload";
import { effectiveZone } from "@/shared/services/card-zones";
import { hydrateCardsFromServer } from "@/shared/services/card-sync";
import { pauseFileRecovery, takeZoneFiles, uploadHeldZoneFiles } from "@/shared/services/deferred-files";
import { isAttachmentType } from "@/shared/services/portfolio-limits";
import { recordConsent } from "@/shared/services/consent-client";
import { setSignupDrafting } from "@/shared/services/signup-gate";
import { createBrowserSupabaseClient } from "@/shared/lib/supabase/browser";
import { useAppStore } from "@/shared/store/app-store";
import type { Card, ContactItem } from "@/shared/types";

const SKY =
  "inline-block border-0 bg-sky px-[21.6px] py-[10.8px] text-center t-caps text-[var(--ink)] disabled:text-[var(--grey)] disabled:opacity-100 [-webkit-tap-highlight-color:transparent]";
const CARD_PAD = "px-[calc(clamp(24px,6.1vw,28px)-3mm)]";
const STARTERS: ScaffoldZone[] = [
  { id: "position", title: "Position", hint: "What you do" },
  { id: "web", title: "Web", hint: "Website" },
  { id: "social", title: "Social", hint: "Instagram, LinkedIn…" },
  { id: "files", title: "Files", hint: "PDF, JPG…" },
  { id: "about", title: "About", hint: "A line about you" },
];
const PASSWORD_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function makePassword() {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  let raw = "";
  for (const byte of bytes) raw += PASSWORD_ALPHABET[byte % PASSWORD_ALPHABET.length] ?? "A";
  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
}

let issuedPassword = "";

function subscribePassword() {
  return () => undefined;
}

function passwordNow() {
  if (!issuedPassword) issuedPassword = makePassword();
  return issuedPassword;
}

function zoneRows(card: Card, items: ContactItem[]) {
  const order = card.rubricOrder?.length ? card.rubricOrder : STARTERS.map((zone) => zone.id);
  const seen = new Set(order);
  const ids = [...order, ...Object.keys(card.rubricLabels ?? {}).filter((id) => !seen.has(id))];
  return ids.map((id) => ({
    id,
    title: card.rubricLabels?.[id]?.trim() || STARTERS.find((zone) => zone.id === id)?.title || id,
    rows: card.contactItemIds.flatMap((itemId) => {
      const item = items.find((entry) => entry.id === itemId);
      if (!item || effectiveZone(card, item) !== id) return [];
      const value = item.value.trim();
      if (!value || value.startsWith("data:")) return [];
      if (isAttachmentType(item.type)) return [{ value, type: item.type, label: item.label }];
      return [{ value }];
    }),
  }));
}

async function keepCardPhoto(cardId: string, file: File, preview: string) {
  const uploaded = await uploadAttachment({ file, kind: "card-photo", cardId });
  const response = await fetch(`/api/cards/${cardId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ photoAttachmentId: uploaded.attachmentId }),
  });
  if (!response.ok) throw new Error("Could not save the photo.");
  useAppStore.getState().updateCard(cardId, { photoAttachmentId: uploaded.attachmentId, photo: preview });
}

export function SignupScreen({
  guest = null,
  event,
  sourceToken = null,
  next = "",
  account = false,
}: {
  guest?: { token: string; name: string; email: string } | null;
  event?: { lookup: string };
  sourceToken?: string | null;
  next?: string;
  account?: boolean;
}) {
  const router = useRouter();
  const layout = useMainLayout();
  const sessionReady = useSessionBootstrap();
  const offeredName = !account && guest?.name?.trim() ? guest.name.trim() : "";
  const offeredEmail = !account && guest?.email?.trim() ? guest.email.trim().toLowerCase() : "";
  const [title, setTitle] = useState(offeredName);
  const [titlePending, setTitlePending] = useState(Boolean(offeredName));
  const [photo, setPhoto] = useState<{ file: File; dataUrl: string } | null>(null);
  const [email, setEmail] = useState(offeredEmail);
  const [emailPending, setEmailPending] = useState(Boolean(offeredEmail));
  const [passwordVisible, setPasswordVisible] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const openAddRef = useRef<(() => void) | null>(null);
  const finished = useRef(false);
  const hadSession = useRef(false);
  const tempId = useRef<string | null>(null);
  const card = useAppStore((state) => (state.signupDraft ? state.cards.at(-1) ?? null : null));
  const ready = Boolean(title.trim() && email.trim() && card);
  const lookup = event?.lookup ?? "";
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

  const password = useSyncExternalStore(subscribePassword, passwordNow, () => "");

  const place = (displayName: string) => {
    setSignupDrafting(true);
    useAppStore.setState({ signupDraft: true });
    const state = useAppStore.getState();
    state.updateSecondCardDraft({ displayName }, state.cards.length + 1);
    const id = useAppStore.getState().cards.at(-1)?.id ?? null;
    if (!id) return;
    tempId.current = id;
    for (const zone of STARTERS) useAppStore.getState().setRubricLabel(id, zone.id, zone.title);
  };

  useLayoutEffect(() => {
    if (account) return;
    hadSession.current = false;
    useAppStore.getState().resetApp();
    place(offeredName);
    return () => {
      if (finished.current) return;
      setSignupDrafting(false);
      useAppStore.getState().resetApp();
    };
  }, [account, offeredName]);

  useEffect(() => {
    if (!account || !sessionReady) return;
    let cancel = false;
    void (async () => {
      const supabase = createBrowserSupabaseClient();
      const { data } = await supabase.auth.getUser();
      const user = data.user;
      const signedIn = Boolean(user && !user.is_anonymous);
      if (cancel) return;
      hadSession.current = signedIn;
      if (!signedIn || !user) {
        router.replace("/register");
        return;
      }
      const found = await supabase.from("cards").select("display_name, photo_attachment_id").eq("owner_id", user.id);
      if (cancel) return;
      const hasPortfolio = (found.data ?? []).some((row) => (row.display_name ?? "").trim() || row.photo_attachment_id);
      if (hasPortfolio) {
        finished.current = true;
        router.replace("/main");
        return;
      }
      const known = (user.email ?? "").trim().toLowerCase();
      if (known) {
        setEmail(known);
        setEmailPending(true);
      }
      place(offeredName);
    })().catch(() => {
      if (!cancel) setError("Could not open your portfolio.");
    });
    return () => {
      cancel = true;
      if (finished.current || !hadSession.current) return;
      setSignupDrafting(false);
      const id = tempId.current;
      const state = useAppStore.getState();
      const keep = new Set(state.cards.filter((entry) => entry.id !== id).flatMap((entry) => entry.contactItemIds));
      useAppStore.setState({
        signupDraft: false,
        cards: id ? state.cards.filter((entry) => entry.id !== id) : state.cards,
        contactItems: state.contactItems.filter((item) => keep.has(item.id) || item.syncedOwner),
      });
    };
  }, [account, offeredName, router, sessionReady]);

  const finish = async () => {
    if (busy || !ready || !card) return;
    const emailValue = email.trim().toLowerCase();
    const titleValue = title.trim();
    setBusy(true);
    setError(null);
    const draftId = card.id;
    const fresh = useAppStore.getState();
    const saved = fresh.cards.find((entry) => entry.id === draftId);
    if (saved && saved.displayName !== titleValue) fresh.updateCard(saved.id, { displayName: titleValue });
    const live = useAppStore.getState();
    const current = live.cards.find((entry) => entry.id === draftId);
    const asked = next || (typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("next") ?? "" : "");
    const body = {
      ...(account ? {} : { email: emailValue, password }),
      card: {
        displayName: titleValue,
        rubricOrder: current?.rubricOrder ?? STARTERS.map((zone) => zone.id),
        rubricLabels: current?.rubricLabels ?? {},
        zones: current ? zoneRows(current, live.contactItems) : [],
      },
      ...(lookup ? { event: { lookup, guestToken } } : {}),
      ...(sourceToken ? { sourceToken } : {}),
      ...(asked ? { next: asked } : {}),
    };
    try {
      const response = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const reply = (await response.json().catch(() => ({}))) as { cardId?: string; next?: string; kind?: string; error?: string };
      if (response.status === 409 || reply.kind === "login") {
        setError("This email already has an account.");
        setBusy(false);
        return;
      }
      if (!response.ok || !reply.cardId) {
        setError(reply.error ?? "Could not create your profile.");
        setBusy(false);
        return;
      }
      finished.current = true;
      const serverCardId = reply.cardId;
      const go = reply.next || "/main";
      if (account) {
        setSignupDrafting(false);
        const state = useAppStore.getState();
        const keep = new Set(state.cards.filter((entry) => entry.id !== draftId).flatMap((entry) => entry.contactItemIds));
        useAppStore.setState({
          signupDraft: false,
          cards: state.cards.filter((entry) => entry.id !== draftId),
          contactItems: state.contactItems.filter((item) => keep.has(item.id) || item.syncedOwner),
        });
      } else {
        const supabase = createBrowserSupabaseClient();
        useAppStore.getState().resetApp();
        clearRegisteredDevice();
        ignoreNextSignedOut();
        await supabase.auth.signOut({ scope: "local" });
        const signed = await supabase.auth.signInWithPassword({ email: emailValue, password });
        if (signed.error || !signed.data.session) {
          setError("Could not open your profile.");
          setBusy(false);
          return;
        }
        markRegisteredDevice();
        clearRegistrationRequired();
        await recordConsent("register").catch(() => undefined);
        useAppStore.setState({ ownerId: signed.data.user?.id ?? null });
      }
      const zoneFiles = takeZoneFiles();
      pauseFileRecovery(true);
      try {
        await hydrateCardsFromServer({ force: true });
        if (photo) useAppStore.getState().updateCard(serverCardId, { photo: photo.dataUrl, photoLook: "shadow" });
        if (zoneFiles.length > 0) await uploadHeldZoneFiles(serverCardId, zoneFiles);
        if (photo) {
          await keepCardPhoto(serverCardId, photo.file, photo.dataUrl).catch(() => undefined);
        }
      } finally {
        pauseFileRecovery(false);
      }
      if (!account) {
        await fetch("/api/account/welcome", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cardId: serverCardId, password }),
        }).catch(() => undefined);
      }
      router.replace(go);
    } catch {
      setError("Could not create your profile.");
      setBusy(false);
    }
  };

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
            style={{ paddingTop: (RULE_GAP_PX - CARD_TOP_TRIM_PX) * scale, paddingBottom: CARD_HEADER_PAD_PX * scale }}
          >
            <div className="flex shrink-0 items-stretch gap-3" style={{ height: photoPx }}>
              <PhotoSlotPicker
                photo={photo?.dataUrl ?? null}
                photoLook="shadow"
                emptyMark={
                  <span className="t-caps px-1 text-center leading-[1.15] text-[var(--grey)]">
                    Add
                    <br />
                    photo
                  </span>
                }
                onPhotoChange={(dataUrl, file) => setPhoto(dataUrl && file ? { file, dataUrl } : null)}
                sizePx={photoPx}
                borderRadiusPx={0}
                surfaceClassName="bg-transparent"
              />
              <div className="relative flex h-full min-w-0 flex-1 flex-col">
                <HeroName
                  value={title}
                  pending={titlePending}
                  onChange={(next) => {
                    setTitlePending(false);
                    setTitle(next);
                    if (card) useAppStore.getState().updateCard(card.id, { displayName: next });
                  }}
                />
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
            {card ? <CardEditList card={card} items={[]} scaffold={STARTERS} openAddRef={openAddRef} /> : null}
            <div className="grid grid-cols-[86px_minmax(0,1fr)] items-center gap-x-[14px] border-t border-[var(--rule)] py-[18px]">
              <span />
              <button
                type="button"
                aria-label="Add"
                className="flex border-0 bg-transparent p-0 text-[var(--ink)]"
                onPointerUp={() => openAddRef.current?.()}
              >
                <MarkPlus />
              </button>
            </div>
          </div>
        </div>
        <div className="bg-sky py-[18px]">
          <div style={{ paddingLeft: inset, paddingRight: inset }}>
            <div className={CARD_PAD}>
              <div className="grid grid-cols-[86px_minmax(0,1fr)] items-center gap-x-[14px]">
                <span className="t-label">
                  Email
                  <span className="relative -top-[0.35em] ml-[0.15em] font-[inherit] text-[1em] leading-none">*</span>
                </span>
                <input
                  type="email"
                  inputMode="email"
                  autoCapitalize="none"
                  autoComplete="email"
                  aria-label="Email"
                  placeholder="name@mail.com"
                  value={email}
                  onChange={(event) => {
                    setEmailPending(false);
                    setEmail(event.target.value);
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
        <div style={{ paddingLeft: inset, paddingRight: inset }}>
          <div className={CARD_PAD}>
            {error ? <p className="mt-4 mb-0 t-meta text-[var(--ink)]">{error}</p> : null}
            <div className="py-[18px]" style={{ paddingLeft: VALUE_AXIS_PX }}>
              <TapButton disabled={busy || !ready} onTap={() => void finish()} className={SKY}>
                Create portfolio
              </TapButton>
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

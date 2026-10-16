"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { customAlphabet, nanoid } from "nanoid";
import { cn } from "@/lib/utils";
import { PhotoSlotPicker } from "@landing/components/photo-slot-picker";
import { QrZone } from "@main/components/qr-zone";
import { SideRail } from "@main/components/side-rail";
import { useMainLayout } from "@main/hooks/use-main-layout";
import {
  BROWSE_QR_SIZE,
  CARD_HEADER_PAD_PX,
  CARD_TOP_TRIM_PX,
  HERO_PHOTO_PX,
  RULE_GAP_PX,
  SHEET_INSET,
  layoutTop,
} from "@main/layout";
import { HeroName } from "@/shared/components/hero-name";
import { MarkPlus } from "@/shared/components/mark-plus";
import { ScreenHeader } from "@/shared/components/screen-header";
import { SectionNumber, ValueCap, sectionNumberLabel } from "@/shared/components/section-number";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { useSessionBootstrap } from "@/shared/hooks/use-session-bootstrap";
import { VALUE_AXIS_PX } from "@/shared/layout/axes";
import { markRegisteredDevice } from "@/shared/lib/registered-device";
import { clearRegistrationRequired, ignoreNextSignedOut } from "@/shared/lib/session-bootstrap";
import { createBrowserSupabaseClient } from "@/shared/lib/supabase/browser";
import { uploadAttachment } from "@/shared/services/attachment-upload";
import { syncCardLinkOrder } from "@/shared/services/card-items-sync";
import { hydrateCardsFromServer } from "@/shared/services/card-sync";
import { CARD_ZONES, zoneForItem } from "@/shared/services/card-zones";
import { recordConsent } from "@/shared/services/consent-client";
import { createEmptyContactItem, findIdenticalItem, normalizeContactItem } from "@/shared/services/contact-item";
import { useAppStore } from "@/shared/store/app-store";
import { useUploadStatus } from "@/shared/store/upload-status";
import type { Card } from "@/shared/types";
import { clearLocal } from "../invite-actions";

const SKY =
  "press inline-block border-0 bg-sky px-[21.6px] py-[10.8px] text-center t-caps text-[var(--ink)] no-underline disabled:text-[var(--grey)] [-webkit-tap-highlight-color:transparent]";
const FIELD =
  "compass-input block w-full border-0 bg-transparent p-0 t-body text-[var(--ink)] caret-[var(--ink)] outline-none placeholder:text-[var(--placeholder)]";
const CARD_PAD = "px-[calc(clamp(24px,6.1vw,28px)-3mm)]";
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EXPIRED = "This link has expired. Enter your email again.";

function subscribeOrigin() {
  return () => {};
}

function originNow() {
  return window.location.origin;
}

function originOnServer() {
  return "";
}

const passwordChars = customAlphabet("ABCDEFGHJKLMNPQRSTUVWXYZ23456789", 8);

/** One-time password shown on the screen: 8 characters, read in two halves. */
function onePassword() {
  const raw = passwordChars();
  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
}

type Row = { id: string; value: string };
type Draft = { name: string; photo: string | null; email: string; rows: Row[] };

const EMPTY_DRAFT: Draft = { name: "", photo: null, email: "", rows: [{ id: "first", value: "" }] };

function draftKey(lookup: string, guestToken: string | null) {
  return `aded:create-portfolio:${lookup}:${guestToken ?? "open"}`;
}

function readDraft(lookup: string, guestToken: string | null): Draft | null {
  try {
    const raw = window.localStorage.getItem(draftKey(lookup, guestToken));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Draft>;
    const rows = Array.isArray(parsed.rows)
      ? parsed.rows.filter((row): row is Row => typeof row?.id === "string" && typeof row?.value === "string")
      : [];
    return {
      name: typeof parsed.name === "string" ? parsed.name : "",
      photo: typeof parsed.photo === "string" ? parsed.photo : null,
      email: typeof parsed.email === "string" ? parsed.email : "",
      rows: rows.length > 0 ? rows : EMPTY_DRAFT.rows,
    };
  } catch {
    return null;
  }
}

function writeDraft(lookup: string, guestToken: string | null, draft: Draft) {
  try {
    window.localStorage.setItem(draftKey(lookup, guestToken), JSON.stringify(draft));
  } catch {
    try {
      window.localStorage.setItem(draftKey(lookup, guestToken), JSON.stringify({ ...draft, photo: null }));
    } catch {
      /* storage full or private: the screen still works, the draft is not kept */
    }
  }
}

function dropDraft(lookup: string, guestToken: string | null) {
  try {
    window.localStorage.removeItem(draftKey(lookup, guestToken));
  } catch {
    /* storage unavailable */
  }
}

/** The section the card would put this row in. Empty, the row asks for a title. */
function rowLabel(value: string) {
  const text = value.trim();
  if (!text) return "Title";
  const zone = zoneForItem(normalizeContactItem(createEmptyContactItem(0), text));
  return CARD_ZONES.find((entry) => entry.id === zone)?.title ?? "Additional";
}

/** The rail draws from a card. Before Create there is none, so the rail gets this blank one, inert. */
const RAIL_CARD: Card = {
  id: "create-portfolio",
  displayName: "",
  title: "",
  status: "draft",
  publicToken: "",
  qrVersion: 1,
  contactItemIds: [],
  nextScanAddons: [],
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
};

async function portfolioLimit(): Promise<number | null> {
  const response = await fetch("/api/account/status", { cache: "no-store" });
  if (!response.ok) return null;
  const status = (await response.json()) as { portfolioLimit?: number };
  return typeof status.portfolioLimit === "number" ? status.portfolioLimit : null;
}

/** The screen's fields become a portfolio of the signed-in account. Over the limit, nothing is added. */
async function buildPortfolio(draft: Draft): Promise<string | null> {
  const limit = await portfolioLimit();
  const store = useAppStore.getState();
  if (limit === null || store.cards.length >= limit) return null;

  const before = store.cards.length;
  store.updateSecondCardDraft({ displayName: draft.name.trim() }, limit);
  const created = useAppStore.getState().cards[before];
  if (!created) throw new Error("Could not save the card");
  const user = useAppStore.getState().user;
  if (!user.onboarded) useAppStore.setState({ user: { ...user, onboarded: true } });

  if (draft.photo) {
    const blob = await (await fetch(draft.photo)).blob();
    const file = new File([blob], "photo.jpg", { type: blob.type || "image/jpeg" });
    const uploaded = await uploadAttachment({ file, kind: "card-photo", cardId: created.id });
    useAppStore.getState().updateCard(created.id, { photoAttachmentId: uploaded.attachmentId });
  }

  const ids: string[] = [];
  for (const value of [draft.email, ...draft.rows.map((row) => row.value)].map((entry) => entry.trim())) {
    if (!value) continue;
    const state = useAppStore.getState();
    let id = findIdenticalItem(state.contactItems, value)?.id ?? null;
    if (!id) {
      id = state.addContactItem();
      if (!id) continue;
      useAppStore.getState().updateContactItem(id, { value });
    }
    if (!ids.includes(id)) ids.push(id);
  }
  const now = new Date().toISOString();
  useAppStore.setState({
    cards: useAppStore.getState().cards.map((card) =>
      card.id === created.id ? { ...card, contactItemIds: ids, updatedAt: now } : card,
    ),
    currentCardIndex: before,
  });

  const state = useAppStore.getState();
  const card = state.cards.find((entry) => entry.id === created.id);
  if (!card) throw new Error("Could not save the card");
  await syncCardLinkOrder(card, state.contactItems.filter((item) => ids.includes(item.id)));
  const saved = await createBrowserSupabaseClient().from("cards").select("id").eq("id", card.id).maybeSingle();
  if (!saved.data) throw new Error("Could not save the card");
  return card.id;
}

function NumberedRow({
  index,
  label,
  muted = false,
  children,
}: {
  index: number;
  label: ReactNode;
  muted?: boolean;
  children: ReactNode;
}) {
  return (
    <section className="min-w-0 border-b border-[var(--rule)] py-[18px]">
      <div className="grid grid-cols-[86px_minmax(0,1fr)] items-start gap-x-[14px]">
        <div className={cn("min-w-0", muted && "[&_[data-section-number]]:text-[var(--placeholder)]")}>
          <SectionNumber value={sectionNumberLabel(index)} />
          <p className="m-0 mt-[6px] t-label">{label}</p>
        </div>
        <ValueCap className="min-w-0">{children}</ValueCap>
      </div>
    </section>
  );
}

export function CreatePortfolio({
  lookup,
  hash,
  guest,
}: {
  lookup: string;
  hash: string;
  guest: { token: string; name: string; email: string } | null;
}) {
  const router = useRouter();
  const layout = useMainLayout();
  const sessionReady = useSessionBootstrap();
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [password, setPassword] = useState("");
  const [changing, setChanging] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [website, setWebsite] = useState("");
  const origin = useSyncExternalStore(subscribeOrigin, originNow, originOnServer);
  const [busy, setBusy] = useState(false);
  const [opening, setOpening] = useState(Boolean(hash));
  const [message, setMessage] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const loaded = useRef(false);
  const ran = useRef(false);
  const passwordRef = useRef<HTMLInputElement>(null);
  const guestToken = guest?.token ?? null;
  const eventPath = `/e/${encodeURIComponent(lookup)}`;
  const api = `/api/events/${encodeURIComponent(lookup)}/portfolio`;
  const qrUrl = guestToken && origin ? `${origin}${eventPath}?g=${encodeURIComponent(guestToken)}` : "";

  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    const kept = readDraft(lookup, guestToken);
    void Promise.resolve().then(() => {
      if (kept) setDraft(kept);
      else if (guest) setDraft({ ...EMPTY_DRAFT, name: guest.name, email: guest.email });
      setPassword(onePassword());
    });
  }, [guest, guestToken, lookup]);

  useEffect(() => {
    if (!loaded.current || hash) return;
    writeDraft(lookup, guestToken, draft);
  }, [draft, guestToken, hash, lookup]);

  /** Signed in: the fields become a portfolio, the account goes to the event, then its own page. */
  const finish = async (welcomePassword: string | null) => {
    const kept = readDraft(lookup, guestToken) ?? draft;
    clearLocal();
    await hydrateCardsFromServer();
    const cardId = await buildPortfolio(kept);
    if (!cardId) useUploadStatus.getState().notify("You're at 3 portfolios — this one wasn't added");
    let pay = false;
    try {
      const joined = await fetch(`/api/events/${encodeURIComponent(lookup)}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...(cardId ? { cardId } : {}), ...(guestToken ? { token: guestToken } : {}) }),
      });
      const body = (await joined.json().catch(() => ({}))) as { pay?: boolean };
      pay = body.pay === true;
    } catch {
      /* the event page still registers later */
    }
    if (welcomePassword && cardId) {
      await fetch(`${api}/welcome`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId, password: welcomePassword }),
      }).catch(() => undefined);
    }
    dropDraft(lookup, guestToken);
    router.replace(pay ? `${eventPath}/join` : "/main");
  };
  const finishRef = useRef(finish);
  useEffect(() => {
    finishRef.current = finish;
  });

  useEffect(() => {
    if (!hash || !sessionReady || ran.current) return;
    ran.current = true;
    void (async () => {
      clearLocal();
      const signed = await createBrowserSupabaseClient().auth.verifyOtp({ token_hash: hash, type: "magiclink" });
      if (signed.error) {
        setOpening(false);
        setMessage(EXPIRED);
        return;
      }
      markRegisteredDevice();
      clearRegistrationRequired();
      await finishRef.current(null);
    })().catch(() => {
      setOpening(false);
      setMessage("Could not create your profile.");
    });
  }, [hash, sessionReady]);

  const update = (data: Partial<Draft>) => setDraft((current) => ({ ...current, ...data }));
  const setRow = (id: string, value: string) =>
    setDraft((current) => ({ ...current, rows: current.rows.map((row) => (row.id === id ? { ...row, value } : row)) }));
  const addRow = () =>
    setDraft((current) => {
      const last = current.rows[current.rows.length - 1];
      if (last && !last.value.trim()) return current;
      return { ...current, rows: [...current.rows, { id: nanoid(8), value: "" }] };
    });

  const email = draft.email.trim().toLowerCase();
  const ready = EMAIL.test(email) && agreed && password.trim().length >= 8;

  const create = async () => {
    if (busy || !ready) return;
    setBusy(true);
    setMessage(null);
    writeDraft(lookup, guestToken, draft);
    const supabase = createBrowserSupabaseClient();
    const send = () =>
      fetch(api, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password: password.trim(), website, guestToken }),
      });
    try {
      let response = await send();
      if (response.status === 401) {
        await supabase.auth.signInAnonymously();
        response = await send();
      }
      const reply = (await response.json().catch(() => ({}))) as {
        kind?: "created" | "mailed" | "go";
        next?: string;
        email?: string;
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
      const signed = await supabase.auth.signInWithPassword({ email, password: password.trim() });
      if (signed.error || !signed.data.session) {
        router.push(`/register?signin=1&next=${encodeURIComponent(`${eventPath}/join`)}`);
        return;
      }
      markRegisteredDevice();
      clearRegistrationRequired();
      await recordConsent("register").catch(() => undefined);
      await finish(password.trim());
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
  const counterRightCss = `calc(${inset}px + clamp(24px, 6.1vw, 28px) - 3mm)`;
  const lastRow = draft.rows[draft.rows.length - 1];

  return (
    <main className="compass-main relative min-h-dvh w-full overflow-x-hidden bg-background pb-16 text-[var(--ink)]">
      <ScreenHeader title="Create a portfolio" fallbackHref={eventPath} spacer={false} />

      {layout ? (
        <>
          {qrUrl ? (
            <QrZone url={qrUrl} visible topOffsetPx={layout.qrTop} scale={scale} />
          ) : (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 flex items-center justify-center t-caps text-[var(--placeholder)]"
              style={{ top: layoutTop(layout.qrTop), height: Math.round(BROWSE_QR_SIZE * scale) }}
            >
              QR
            </div>
          )}
          <div inert className="[&_*]:!pointer-events-none [&_*]:!text-[var(--placeholder)]">
            <SideRail
              qrTop={layout.qrTop}
              counterRightCss={counterRightCss}
              card={RAIL_CARD}
              index={1}
              total={1}
              showPlus
              frozen
            />
          </div>
        </>
      ) : null}

      <div style={{ paddingTop: layout?.cardTopBrowse ?? 0, paddingLeft: inset, paddingRight: inset }}>
        <div className={CARD_PAD}>
          <div
            className="border-b border-[var(--rule)]"
            style={{
              paddingTop: (RULE_GAP_PX - CARD_TOP_TRIM_PX) * scale,
              paddingBottom: CARD_HEADER_PAD_PX * scale,
            }}
          >
            <div className="flex shrink-0 items-stretch gap-3" style={{ height: photoPx }}>
              <PhotoSlotPicker
                photo={draft.photo}
                onPhotoChange={(photo) => update({ photo })}
                sizePx={photoPx}
                borderRadiusPx={0}
                surfaceClassName="bg-transparent"
              />
              <div className="relative flex h-full min-w-0 flex-1 flex-col">
                <HeroName value={draft.name} onChange={(name) => update({ name })} />
              </div>
            </div>
          </div>

          {sentTo ? (
            <p className="mt-6 mb-0 max-w-xs t-meta" style={{ marginLeft: VALUE_AXIS_PX }}>
              {`Check ${sentTo}. Open the link in the email to sign in and join.`}
            </p>
          ) : (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void create();
              }}
            >
              <NumberedRow index={0} label="Email *">
                <input
                  type="email"
                  inputMode="email"
                  autoCapitalize="none"
                  autoComplete="email"
                  aria-label="Email"
                  placeholder="name@mail.com"
                  value={draft.email}
                  readOnly={Boolean(guest?.email)}
                  onChange={(event) => update({ email: event.target.value })}
                  className={FIELD}
                />
                <p className="mt-2 mb-0 t-meta text-[var(--grey)]">Required. We send your profile and code here.</p>
              </NumberedRow>

              <NumberedRow index={1} label="Password">
                <div className="flex items-baseline gap-3">
                  {changing ? (
                    <input
                      ref={passwordRef}
                      type="text"
                      autoCapitalize="none"
                      autoComplete="new-password"
                      aria-label="Password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      className={cn(FIELD, "min-w-0 flex-1")}
                    />
                  ) : (
                    <span className="min-w-0 flex-1 t-body">{password}</span>
                  )}
                  {changing ? null : (
                    <button
                      type="button"
                      onClick={() => {
                        setChanging(true);
                        window.setTimeout(() => passwordRef.current?.select(), 0);
                      }}
                      className="press shrink-0 border-0 bg-transparent p-0 t-caps text-[var(--grey)] underline [-webkit-tap-highlight-color:transparent]"
                    >
                      Change
                    </button>
                  )}
                </div>
                <p className="mt-2 mb-0 t-meta text-[var(--grey)]">
                  One-time password — set your own now, or change it later in Profile.
                </p>
                {changing && password.trim().length < 8 ? (
                  <p className="mt-2 mb-0 t-meta text-[var(--ink)]">Use at least 8 characters.</p>
                ) : null}
              </NumberedRow>

              {draft.rows.map((row, index) => (
                <NumberedRow key={row.id} index={index + 2} label={rowLabel(row.value)} muted={!row.value.trim()}>
                  <input
                    type="text"
                    aria-label={rowLabel(row.value)}
                    placeholder="description"
                    value={row.value}
                    onChange={(event) => setRow(row.id, event.target.value)}
                    className={FIELD}
                  />
                </NumberedRow>
              ))}

              <div className="flex flex-col items-center border-b border-[var(--rule)] py-[18px]">
                <button
                  type="button"
                  aria-label="Add"
                  disabled={!lastRow?.value.trim()}
                  onClick={addRow}
                  className="press flex size-7 items-center justify-center border-0 bg-transparent text-[var(--ink)] disabled:text-[var(--placeholder)] [-webkit-tap-highlight-color:transparent]"
                >
                  <MarkPlus />
                </button>
                <p className="mt-2 mb-0 t-meta text-[var(--grey)]">Add links, files, socials, text</p>
              </div>

              <div className="grid grid-cols-[86px_minmax(0,1fr)] items-start gap-x-[14px] pt-[18px]">
                <Checkbox
                  id="create-consent"
                  checked={agreed}
                  onCheckedChange={(value) => setAgreed(value === true)}
                  className="mt-0.5"
                />
                <label htmlFor="create-consent" className="t-meta text-[var(--ink)]">
                  I agree to the{" "}
                  <Link href="/terms" className="underline">
                    Terms &amp; Conditions
                  </Link>{" "}
                  and{" "}
                  <Link href="/privacy" className="underline">
                    Privacy Policy
                  </Link>
                  .
                </label>
              </div>

              <input
                type="text"
                name="website"
                tabIndex={-1}
                autoComplete="off"
                aria-hidden
                value={website}
                onChange={(event) => setWebsite(event.target.value)}
                className="pointer-events-none absolute -left-[9999px] h-px w-px opacity-0"
              />

              <div className="mt-6" style={{ paddingLeft: VALUE_AXIS_PX }}>
                <button type="submit" disabled={busy || !ready || !sessionReady} className={SKY}>
                  Create my profile
                </button>
                {message ? <p className="mt-3 mb-0 t-meta text-[var(--ink)]">{message}</p> : null}
              </div>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}

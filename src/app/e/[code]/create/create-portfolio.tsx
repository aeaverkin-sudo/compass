"use client";

import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { customAlphabet, nanoid } from "nanoid";
import { cn } from "@/lib/utils";
import { PhotoSlotPicker } from "@landing/components/photo-slot-picker";
import { useMainLayout } from "@main/hooks/use-main-layout";
import { CARD_HEADER_PAD_PX, CARD_TOP_TRIM_PX, HERO_PHOTO_PX, RULE_GAP_PX, SCREEN_TOP_AXIS_PX, SHEET_INSET } from "@main/layout";
import { HeroName } from "@/shared/components/hero-name";
import { ScreenHeader } from "@/shared/components/screen-header";
import { TapButton } from "@/shared/components/tap-button";
import { SectionNumber, ValueCap, sectionNumberLabel } from "@/shared/components/section-number";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { useSessionBootstrap } from "@/shared/hooks/use-session-bootstrap";
import { HEADER_ROW_PX, VALUE_AXIS_PX } from "@/shared/layout/axes";
import { markRegisteredDevice } from "@/shared/lib/registered-device";
import { clearRegistrationRequired, ignoreNextSignedOut } from "@/shared/lib/session-bootstrap";
import { INVITE_TITLE_MAX, INVITE_VALUE_MAX } from "@/shared/event/invite-rows";
import { createBrowserSupabaseClient } from "@/shared/lib/supabase/browser";
import { uploadAttachment } from "@/shared/services/attachment-upload";
import { syncCardLinkOrder } from "@/shared/services/card-items-sync";
import { hydrateCardsFromServer } from "@/shared/services/card-sync";
import { recordConsent } from "@/shared/services/consent-client";
import { withItemZone, zoneForItem } from "@/shared/services/card-zones";
import { findIdenticalItem } from "@/shared/services/contact-item";
import { PORTFOLIO_LIMITS } from "@/shared/services/portfolio-limits";
import { useAppStore } from "@/shared/store/app-store";
import { useUploadStatus } from "@/shared/store/upload-status";
import { clearLocal } from "../invite-actions";

const CREATE_BTN =
  "press w-full rounded-full border-0 bg-[var(--ink)] py-[14px] text-center t-caps text-[var(--background)] disabled:opacity-40 [-webkit-tap-highlight-color:transparent]";
const HINT = "var(--placeholder)";
const FIELD =
  "compass-input block w-full border-0 bg-transparent p-0 t-body text-[var(--ink)] caret-[var(--ink)] outline-none placeholder:text-[var(--placeholder)]";
const TITLE_FIELD =
  "t-label mt-[6px] block w-full min-w-0 resize-none overflow-hidden border-0 bg-transparent p-0 outline-none placeholder:text-[var(--placeholder)]";
const CARD_PAD = "px-[calc(clamp(24px,6.1vw,28px)-3mm)]";
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EXPIRED = "This link has expired. Enter your email again.";

const passwordChars = customAlphabet("ABCDEFGHJKLMNPQRSTUVWXYZ23456789", 8);

/** One-time password shown on the screen: 8 characters, read in two halves. */
function onePassword() {
  const raw = passwordChars();
  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
}

type Row = { id: string; title: string; value: string };
type Draft = { name: string; photo: string | null; email: string; rows: Row[] };

const EMPTY_DRAFT: Draft = { name: "", photo: null, email: "", rows: [] };

function draftKey(lookup: string, guestToken: string | null) {
  return `aded:create-portfolio:${lookup}:${guestToken ?? "open"}`;
}

function readDraft(lookup: string, guestToken: string | null): Draft | null {
  try {
    const raw = window.localStorage.getItem(draftKey(lookup, guestToken));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Draft>;
    const rows = Array.isArray(parsed.rows)
      ? parsed.rows.flatMap((row) => {
          if (!row || typeof row.id !== "string" || typeof row.value !== "string") return [];
          return [{ id: row.id, title: typeof row.title === "string" ? row.title : "", value: row.value } satisfies Row];
        })
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
  const lines: { title: string; value: string }[] = [
    { title: "", value: draft.email },
    ...draft.rows.map((row) => ({ title: row.title, value: row.value })),
  ];
  for (const line of lines) {
    const value = line.value.trim();
    if (!value) continue;
    const state = useAppStore.getState();
    let id = findIdenticalItem(state.contactItems, value)?.id ?? null;
    if (!id) {
      id = state.addContactItem();
      if (!id) continue;
      useAppStore.getState().updateContactItem(id, { value });
      const title = line.title.trim();
      if (title) useAppStore.getState().updateContactItem(id, { label: title });
    }
    if (!ids.includes(id)) ids.push(id);
  }
  const now = new Date().toISOString();
  const after = useAppStore.getState();
  let itemZones: Record<string, string> | undefined;
  for (const id of ids) {
    const item = after.contactItems.find((entry) => entry.id === id);
    if (!item) continue;
    const zone = zoneForItem(item);
    itemZones = withItemZone({ itemZones }, item, zone);
  }
  useAppStore.setState({
    cards: after.cards.map((card) =>
      card.id === created.id ? { ...card, contactItemIds: ids, itemZones, updatedAt: now } : card,
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

/** Extra card rows: the same title + description fields as the event-form custom row, with a stable key. */
function AddPlus({ onTap, disabled }: { onTap: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      data-no-swipe
      aria-label="Add"
      disabled={disabled}
      className="t-body w-full bg-transparent text-left disabled:opacity-40"
      style={{ color: HINT }}
      onPointerUp={() => {
        if (disabled) return;
        onTap();
      }}
    >
      +
    </button>
  );
}

const DraftRow = memo(function DraftRow({
  index,
  row,
  focusTurn,
  onPatch,
  onRemove,
  onAdd,
  atLimit,
}: {
  index: number;
  row: Row;
  focusTurn: number;
  onPatch: (id: string, patch: Partial<Pick<Row, "title" | "value">>) => void;
  onRemove: (id: string) => void;
  onAdd?: () => void;
  atLimit?: boolean;
}) {
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const valueRef = useRef<HTMLTextAreaElement>(null);
  const empty = !row.title.trim() && !row.value.trim();
  const removeIfEmpty = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter") event.preventDefault();
    if ((event.key !== "Backspace" && event.key !== "Delete") || !empty) return;
    event.preventDefault();
    onRemove(row.id);
  };
  useLayoutEffect(() => {
    for (const node of [titleRef.current, valueRef.current]) {
      if (!node) continue;
      node.style.height = "auto";
      node.style.height = `${node.scrollHeight}px`;
    }
  }, [row.title, row.value]);
  useEffect(() => {
    if (focusTurn > 0) titleRef.current?.focus();
  }, [focusTurn]);
  return (
    <section className="min-w-0 border-b border-[var(--rule)] py-[18px]">
      <div className="grid grid-cols-[86px_minmax(0,1fr)] items-start gap-x-[14px]">
        <div className={cn("min-w-0", empty && "[&_[data-section-number]]:text-[var(--placeholder)]")}>
          <SectionNumber value={sectionNumberLabel(index)} />
          <textarea
            ref={titleRef}
            rows={1}
            value={row.title}
            maxLength={INVITE_TITLE_MAX}
            aria-label="Title"
            placeholder="Title…"
            onChange={(event) => onPatch(row.id, { title: event.target.value.replace(/\n/g, " ") })}
            onKeyDown={removeIfEmpty}
            className={TITLE_FIELD}
          />
        </div>
        <ValueCap className="flex min-w-0 flex-col gap-[6px]">
          <textarea
            ref={valueRef}
            rows={1}
            value={row.value}
            maxLength={INVITE_VALUE_MAX}
            aria-label={row.title.trim() || "Add"}
            placeholder="add…"
            onChange={(event) => onPatch(row.id, { value: event.target.value })}
            onKeyDown={removeIfEmpty}
            className={cn(FIELD, "resize-none overflow-hidden")}
          />
          {onAdd ? <AddPlus onTap={onAdd} disabled={atLimit} /> : null}
        </ValueCap>
      </div>
    </section>
  );
});

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
  const [busy, setBusy] = useState(false);
  const [opening, setOpening] = useState(Boolean(hash));
  const [message, setMessage] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const loaded = useRef(false);
  const ran = useRef(false);
  const passwordRef = useRef<HTMLInputElement>(null);
  const draftRef = useRef(draft);
  const [focusRow, setFocusRow] = useState({ id: "", turn: 0 });
  const guestToken = guest?.token ?? null;
  const eventPath = `/e/${encodeURIComponent(lookup)}`;
  const api = `/api/events/${encodeURIComponent(lookup)}/portfolio`;

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
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    if (!loaded.current || hash) return;
    const timer = window.setTimeout(() => writeDraft(lookup, guestToken, draft), 400);
    return () => window.clearTimeout(timer);
  }, [draft, guestToken, hash, lookup]);

  useEffect(() => {
    return () => {
      if (loaded.current && !hash) writeDraft(lookup, guestToken, draftRef.current);
    };
  }, [guestToken, hash, lookup]);

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
  const patchRow = useCallback((id: string, patch: Partial<Pick<Row, "title" | "value">>) => {
    setDraft((current) => ({
      ...current,
      rows: current.rows.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    }));
  }, []);
  const removeRow = useCallback((id: string) => {
    setDraft((current) => ({ ...current, rows: current.rows.filter((row) => row.id !== id) }));
  }, []);
  const addRow = () => {
    const blank = draft.rows.find((row) => !row.title.trim() && !row.value.trim());
    if (blank) {
      setFocusRow((focus) => ({ id: blank.id, turn: focus.turn + 1 }));
      return;
    }
    if (draft.rows.length >= PORTFOLIO_LIMITS.maxItemsOnCard) return;
    const id = nanoid(8);
    setFocusRow((focus) => ({ id, turn: focus.turn + 1 }));
    setDraft((current) => {
      if (current.rows.length >= PORTFOLIO_LIMITS.maxItemsOnCard) return current;
      if (current.rows.some((row) => !row.title.trim() && !row.value.trim())) return current;
      return { ...current, rows: [...current.rows, { id, title: "", value: "" }] };
    });
  };

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
  const atRowLimit = draft.rows.length >= PORTFOLIO_LIMITS.maxItemsOnCard;
  const headerPad = `calc(env(safe-area-inset-top) + ${SCREEN_TOP_AXIS_PX}px - ${HEADER_ROW_PX / 2}px + ${HEADER_ROW_PX}px)`;

  return (
    <main className="compass-main fixed inset-0 flex flex-col overflow-hidden bg-background text-[var(--ink)]">
      <ScreenHeader title="Create a portfolio" fallbackHref={eventPath} spacer={false} />

      {sentTo ? (
        <p className="mt-6 mb-0 max-w-xs t-meta" style={{ marginLeft: inset + VALUE_AXIS_PX, paddingTop: headerPad }}>
          {`Check ${sentTo}. Open the link in the email to sign in and join.`}
        </p>
      ) : (
        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            void create();
          }}
        >
          <div
            className="shrink-0 bg-background"
            style={{ paddingTop: headerPad, paddingLeft: inset, paddingRight: inset }}
          >
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
            </div>
          </div>

          <div
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
            style={{ paddingLeft: inset, paddingRight: inset }}
          >
            <div className={CARD_PAD}>
              <NumberedRow index={0} label="Email*">
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
                    <TapButton
                      onTap={() => {
                        setChanging(true);
                        window.setTimeout(() => passwordRef.current?.select(), 0);
                      }}
                      className="press shrink-0 border-0 bg-transparent p-0 t-caps text-[var(--grey)] underline [-webkit-tap-highlight-color:transparent]"
                    >
                      Change
                    </TapButton>
                  )}
                </div>
                <p className="mt-2 mb-0 t-meta text-[var(--grey)]">
                  One-time password — set your own now, or change it later in Profile.
                </p>
                {changing && password.trim().length < 8 ? (
                  <p className="mt-2 mb-0 t-meta text-[var(--ink)]">Use at least 8 characters.</p>
                ) : null}
              </NumberedRow>

              <NumberedRow index={2} label="Social">
                <div className="flex flex-col gap-[6px]">
                  <p className="m-0 t-body" style={{ color: HINT }}>
                    Instagram, LinkedIn, Facebook
                  </p>
                  {draft.rows.length === 0 ? <AddPlus onTap={addRow} disabled={atRowLimit} /> : null}
                </div>
              </NumberedRow>

              {draft.rows.map((row, index) => (
                <DraftRow
                  key={row.id}
                  index={index + 3}
                  row={row}
                  focusTurn={focusRow.id === row.id ? focusRow.turn : 0}
                  onPatch={patchRow}
                  onRemove={removeRow}
                  onAdd={index === draft.rows.length - 1 ? addRow : undefined}
                  atLimit={atRowLimit}
                />
              ))}

              <div className="grid grid-cols-[86px_minmax(0,1fr)] items-start gap-x-[14px] py-[18px]">
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
              <TapButton
                type="submit"
                disabled={busy || !ready || !sessionReady}
                onTap={() => void create()}
                className={CREATE_BTN}
              >
                Create portfolio
              </TapButton>
              {message ? <p className="mt-3 mb-0 t-meta text-[var(--ink)]">{message}</p> : null}
            </div>
          </div>
        </form>
      )}
    </main>
  );
}

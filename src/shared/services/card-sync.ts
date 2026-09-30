import { nanoid } from "nanoid";
import { handlesForCards, slugFromName } from "@/shared/services/card-handle";
import type { Card, CardStatus } from "@/shared/types";
import { asCardStatus } from "@/shared/lib/card-status";
import { createBrowserSupabaseClient } from "@/shared/lib/supabase/browser";

const UPSERT_DEBOUNCE_MS = 400;
const PUBLIC_TOKEN_LENGTH = 21;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type CardRow = {
  id: string;
  display_name: string;
  title: string;
  status: string;
  public_token: string;
  handle?: string | null;
  qr_version: number;
  is_public: boolean;
  listed: boolean | null;
  photo_attachment_id: string | null;
  created_at: string;
  updated_at: string;
};

const CARD_COLUMNS =
  "id, display_name, title, status, public_token, qr_version, is_public, listed, photo_attachment_id, created_at, updated_at";

const pendingUpserts = new Map<string, { timer: ReturnType<typeof setTimeout>; card: Card }>();
let hydrateChain: Promise<void> = Promise.resolve();
let hydratesLeft = 0;
let cardsHydrated = false;
const cardsHydratedListeners = new Set<() => void>();

function markCardsHydrated() {
  if (cardsHydrated) return;
  cardsHydrated = true;
  for (const listener of cardsHydratedListeners) listener();
}

/** True after the latest server pull has finished, including a failed one. */
export function getCardsHydrated() {
  return cardsHydrated;
}

export function subscribeCardsHydrated(listener: () => void) {
  cardsHydratedListeners.add(listener);
  return () => {
    cardsHydratedListeners.delete(listener);
  };
}

function isCardUuid(id: string) {
  return UUID_RE.test(id);
}

/** UUID id, draft status, and a public token. Leaves photo and items untouched. */
export function ensureCardIdentity(card: Card): Card {
  return {
    ...card,
    id: isCardUuid(card.id) ? card.id : crypto.randomUUID(),
    status: card.status ?? "draft",
    publicToken:
      card.publicToken && card.publicToken.length >= 16 ? card.publicToken : nanoid(PUBLIC_TOKEN_LENGTH),
    qrVersion: card.qrVersion && card.qrVersion > 0 ? card.qrVersion : 1,
  };
}

/** A card with a QR is public: name plus a stored photo. A local preview is not enough for /c/. */
export function statusForPublish(card: Card): CardStatus {
  if (card.status === "archived" || card.status === "suspended") return card.status;
  if (card.displayName.trim() && card.photoAttachmentId) return "published";
  return "draft";
}

function overlayScalars(local: Card, row: CardRow): Card {
  const remotePhotoId = row.photo_attachment_id ?? undefined;
  return {
    ...local,
    id: row.id,
    displayName: row.display_name,
    title: row.title,
    status: asCardStatus(row.status),
    publicToken: row.public_token,
    handle: row.handle?.trim().toLowerCase() || local.handle,
    qrVersion: row.qr_version,
    photoAttachmentId: remotePhotoId ?? local.photoAttachmentId,
    photo: remotePhotoId ? undefined : local.photo,
    listed: row.listed ?? local.listed,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function shellFromRow(row: CardRow): Card {
  return {
    id: row.id,
    displayName: row.display_name,
    title: row.title,
    status: asCardStatus(row.status),
    publicToken: row.public_token,
    handle: row.handle?.trim().toLowerCase() || undefined,
    qrVersion: row.qr_version,
    photoAttachmentId: row.photo_attachment_id ?? undefined,
    listed: row.listed ?? undefined,
    contactItemIds: [],
    nextScanAddons: [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Keep local order. Server scalars win on the same id. Local-only cards get a UUID. */
export function mergeCardScalars(local: Card[], remote: CardRow[]): Card[] {
  const remoteById = new Map(remote.map((row) => [row.id, row]));
  const seen = new Set<string>();
  const next: Card[] = [];

  for (const card of local) {
    const row = remoteById.get(card.id);
    if (row) {
      seen.add(row.id);
      next.push(overlayScalars(card, row));
      continue;
    }
    next.push(ensureCardIdentity(card));
  }

  const extras = remote
    .filter((row) => !seen.has(row.id))
    .sort((a, b) => a.created_at.localeCompare(b.created_at));

  for (const row of extras) next.push(shellFromRow(row));
  return next;
}

function scalarsEqual(a: Card, b: Card) {
  return (
    a.id === b.id &&
    a.displayName === b.displayName &&
    a.title === b.title &&
    a.status === b.status &&
    a.publicToken === b.publicToken &&
    a.handle === b.handle &&
    a.qrVersion === b.qrVersion &&
    a.photoAttachmentId === b.photoAttachmentId &&
    a.photo === b.photo &&
    a.listed === b.listed &&
    a.createdAt === b.createdAt &&
    a.updatedAt === b.updatedAt
  );
}

async function currentUserId() {
  const supabase = createBrowserSupabaseClient();
  const { data, error } = await supabase.auth.getUser();
  if (!data.user) {
    if (error && error.name !== "AuthSessionMissingError") {
      console.error("[card-sync]", error.message);
    }
    return null;
  }
  return data.user.id;
}

/** Upsert scalar columns only. The avatar is `photo_attachment_id`, never the image bytes. */
export async function upsertCardScalars(card: Card): Promise<void> {
  try {
    if (!isCardUuid(card.id)) return;

    const ownerId = await currentUserId();
    if (!ownerId) return;

    const supabase = createBrowserSupabaseClient();
    let handle = card.handle?.trim().toLowerCase() || null;
    let error: { message: string; code?: string } | null = null;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const row = {
        id: card.id,
        owner_id: ownerId,
        display_name: card.displayName,
        title: card.title,
        status: statusForPublish(card),
        public_token: card.publicToken,
        handle,
        qr_version: card.qrVersion,
        is_public: true,
        listed: card.listed ?? true,
        photo_attachment_id: card.photoAttachmentId ?? null,
        created_at: card.createdAt,
        updated_at: card.updatedAt,
      };
      const saved = await supabase.from("cards").upsert(row, { onConflict: "id", defaultToNull: false });
      error = saved.error;
      if (!error) {
        if (handle && handle !== card.handle) {
          const savedHandle = handle;
          const { useAppStore } = await import("@/shared/store/app-store");
          useAppStore.setState({
            cards: useAppStore.getState().cards.map((entry) =>
              entry.id === card.id ? { ...entry, handle: savedHandle } : entry,
            ),
          });
        }
        return;
      }
      if (error.code === "23505" && /handle/i.test(error.message)) {
        const base = slugFromName(card.displayName);
        if (!base) break;
        handle = `${base}-${attempt + 2}`;
        continue;
      }
      if (/handle/i.test(error.message) && /column|schema/i.test(error.message)) {
        const { handle: _dropped, ...withoutHandle } = row;
        void _dropped;
        const again = await supabase.from("cards").upsert(withoutHandle, { onConflict: "id", defaultToNull: false });
        error = again.error;
      }
      break;
    }

    if (error) {
      console.error("[card-sync] upsert failed", error.message);
      if (/portfolio_limit/i.test(error.message)) {
        const { useAppStore } = await import("@/shared/store/app-store");
        const state = useAppStore.getState();
        const cards = state.cards.filter((entry) => entry.id !== card.id);
        useAppStore.setState({
          cards,
          currentCardIndex: Math.min(state.currentCardIndex, Math.max(cards.length - 1, 0)),
        });
      }
    }
  } catch (error) {
    console.error("[card-sync] upsert failed", error);
  }
}

/** Coalesce keystroke updates. The latest card object wins. */
export function scheduleCardUpsert(card: Card, options?: { pulse?: boolean }) {
  const previous = pendingUpserts.get(card.id);
  if (previous) clearTimeout(previous.timer);

  const pulse = options?.pulse !== false;
  const timer = setTimeout(() => {
    pendingUpserts.delete(card.id);
    void (async () => {
      const { useAppStore } = await import("@/shared/store/app-store");
      const live = useAppStore.getState().cards.find((entry) => entry.id === card.id) ?? card;
      await upsertCardScalars(live);
      if (!pulse) return;
      const { requestLiveQrPulse } = await import("@/shared/lib/live-qr-pulse");
      requestLiveQrPulse(card.id);
    })();
  }, UPSERT_DEBOUNCE_MS);

  pendingUpserts.set(card.id, { timer, card });
}

/** Writes Public/Private without the full upsert, which would otherwise keep the column default. */
export function writeCardListed(cardId: string, listed: boolean) {
  const pending = pendingUpserts.get(cardId);
  if (pending) pending.card = { ...pending.card, listed };
  const supabase = createBrowserSupabaseClient();
  void supabase
    .from("cards")
    .update({ listed })
    .eq("id", cardId)
    .then(({ error }) => {
      if (error) console.error("[card-sync] listed", error.message);
    });
}

/** Drop queued writes. Used when signing into an existing account so the trial card is not copied over. */
export function dropPendingCardUpserts() {
  for (const pending of pendingUpserts.values()) clearTimeout(pending.timer);
  pendingUpserts.clear();
}

function flushPendingUpserts() {
  for (const [id, pending] of pendingUpserts) {
    clearTimeout(pending.timer);
    pendingUpserts.delete(id);
    void upsertCardScalars(pending.card);
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushPendingUpserts();
  });
}

async function waitForPersist() {
  const { useAppStore } = await import("@/shared/store/app-store");
  if (useAppStore.persist.hasHydrated()) return;

  await new Promise<void>((resolve) => {
    if (useAppStore.persist.hasHydrated()) {
      resolve();
      return;
    }
    const unsubscribe = useAppStore.persist.onFinishHydration(() => {
      unsubscribe();
      resolve();
    });
    if (useAppStore.persist.hasHydrated()) {
      unsubscribe();
      resolve();
    }
  });
}

async function runHydrate() {
  await waitForPersist();

  const ownerId = await currentUserId();
  if (!ownerId) return;

  const supabase = createBrowserSupabaseClient();
  const withHandle = await supabase.from("cards").select(`${CARD_COLUMNS}, handle`).eq("owner_id", ownerId);
  const loaded =
    withHandle.error && /handle/i.test(withHandle.error.message)
      ? await supabase.from("cards").select(CARD_COLUMNS).eq("owner_id", ownerId)
      : withHandle;
  if (loaded.error) {
    console.error("[card-sync] load failed", loaded.error.message);
    return;
  }
  const data = loaded.data;

  const remote = (data ?? []) as CardRow[];
  const { useAppStore } = await import("@/shared/store/app-store");
  const local = useAppStore.getState().cards;
  const merged = handlesForCards(
    mergeCardScalars(local, remote).map((card) => {
      const status = statusForPublish(card);
      return status === card.status ? card : { ...card, status };
    }),
  );
  const unchanged =
    merged.length === local.length && merged.every((card, index) => scalarsEqual(card, local[index]!));

  if (!unchanged) useAppStore.setState({ cards: merged });

  const hasPortfolio = merged.some(
    (card) => card.displayName.trim().length > 0 || Boolean(card.photoAttachmentId),
  );
  if (hasPortfolio) {
    const { user } = useAppStore.getState();
    if (!user.onboarded) {
      useAppStore.setState({ user: { ...user, onboarded: true } });
    }
  }

  const remoteById = new Map(remote.map((row) => [row.id, row]));
  const toUpload = merged.filter((card) => {
    const row = remoteById.get(card.id);
    return !row || row.status !== card.status || !row.is_public || (Boolean(card.handle) && row.handle !== card.handle);
  });
  await Promise.all(toUpload.map((card) => upsertCardScalars(card)));

  const { hydrateCardItems } = await import("@/shared/services/card-items-sync");
  await hydrateCardItems();

  const { migrateLocalMedia } = await import("@/shared/services/attachment-upload");
  await migrateLocalMedia();

  const { hydrateNotes } = await import("@/shared/services/notes-sync");
  await hydrateNotes();

  const { armLiveQrPulse } = await import("@/shared/lib/live-qr-pulse");
  armLiveQrPulse();
}

/**
 * Pull server scalars after a session exists. Safe to call more than once.
 * A call that arrives while a pull is running waits, then pulls again, so a
 * sign-in does not keep the previous account's result.
 */
export function hydrateCardsFromServer(): Promise<void> {
  hydratesLeft += 1;
  const run = hydrateChain.then(() => runHydrate()).catch((error) => {
    console.error("[card-sync] hydrate failed", error);
  });
  hydrateChain = run.then(() => {
    hydratesLeft -= 1;
    if (hydratesLeft === 0) markCardsHydrated();
  });
  return hydrateChain;
}

import { nanoid } from "nanoid";
import type { Card, CardStatus } from "@/shared/types";
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
  qr_version: number;
  created_at: string;
  updated_at: string;
};

const CARD_COLUMNS =
  "id, display_name, title, status, public_token, qr_version, created_at, updated_at";

const pendingUpserts = new Map<string, { timer: ReturnType<typeof setTimeout>; card: Card }>();
let hydrateTask: Promise<void> | null = null;

function isCardUuid(id: string) {
  return UUID_RE.test(id);
}

function asStatus(value: string): CardStatus {
  if (value === "published" || value === "archived" || value === "suspended") return value;
  return "draft";
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

function overlayScalars(local: Card, row: CardRow): Card {
  return {
    ...local,
    id: row.id,
    displayName: row.display_name,
    title: row.title,
    status: asStatus(row.status),
    publicToken: row.public_token,
    qrVersion: row.qr_version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function shellFromRow(row: CardRow): Card {
  return {
    id: row.id,
    displayName: row.display_name,
    title: row.title,
    status: asStatus(row.status),
    publicToken: row.public_token,
    qrVersion: row.qr_version,
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
    a.qrVersion === b.qrVersion &&
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

/** Upsert scalar columns only. Never sends photo or item fields. */
export async function upsertCardScalars(card: Card): Promise<void> {
  try {
    if (!isCardUuid(card.id)) return;

    const ownerId = await currentUserId();
    if (!ownerId) return;

    const supabase = createBrowserSupabaseClient();
    const { error } = await supabase.from("cards").upsert(
      {
        id: card.id,
        owner_id: ownerId,
        display_name: card.displayName,
        title: card.title,
        status: card.status,
        public_token: card.publicToken,
        qr_version: card.qrVersion,
        created_at: card.createdAt,
        updated_at: card.updatedAt,
      },
      // Omitted columns (photo_attachment_id, item_order_manual) keep their defaults
      // on insert and are not overwritten on conflict.
      { onConflict: "id", defaultToNull: false },
    );

    if (error) console.error("[card-sync] upsert failed", error.message);
  } catch (error) {
    console.error("[card-sync] upsert failed", error);
  }
}

/** Coalesce keystroke updates. The latest card object wins. */
export function scheduleCardUpsert(card: Card) {
  const previous = pendingUpserts.get(card.id);
  if (previous) clearTimeout(previous.timer);

  const timer = setTimeout(() => {
    pendingUpserts.delete(card.id);
    void upsertCardScalars(card);
  }, UPSERT_DEBOUNCE_MS);

  pendingUpserts.set(card.id, { timer, card });
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
  const { data, error } = await supabase.from("cards").select(CARD_COLUMNS).eq("owner_id", ownerId);

  if (error) {
    console.error("[card-sync] load failed", error.message);
    return;
  }

  const remote = (data ?? []) as CardRow[];
  const { useAppStore } = await import("@/shared/store/app-store");
  const local = useAppStore.getState().cards;
  const merged = mergeCardScalars(local, remote);
  const unchanged =
    merged.length === local.length && merged.every((card, index) => scalarsEqual(card, local[index]!));

  if (!unchanged) useAppStore.setState({ cards: merged });

  const remoteIds = new Set(remote.map((row) => row.id));
  const toUpload = merged.filter((card) => !remoteIds.has(card.id));
  await Promise.all(toUpload.map((card) => upsertCardScalars(card)));
}

/** Pull server scalars after the anonymous session exists. Safe to call more than once. */
export function hydrateCardsFromServer() {
  if (!hydrateTask) {
    hydrateTask = runHydrate()
      .catch((error) => {
        console.error("[card-sync] hydrate failed", error);
      })
      .finally(() => {
        hydrateTask = null;
      });
  }
  return hydrateTask;
}

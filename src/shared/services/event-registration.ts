import { nanoid } from "nanoid";
import { asCardStatus } from "@/shared/lib/card-status";
import { createAdminSupabaseClient } from "@/shared/lib/supabase/admin";
import { isUuid } from "@/shared/services/attachment-api";
import { loadEventInvite, type EventInvite } from "@/shared/services/event-invite";
import type { Card, ContactItem, ContactType } from "@/shared/types";

const TOKEN_LENGTH = 21;
const REG_TOKEN = /^[A-Za-z0-9_-]{21}$/;

export type EventRegistration = {
  id: string;
  eventId: string;
  cardId: string;
  regToken: string;
  consentAnalytics: boolean;
  consentConnections: boolean;
};

export type BadgeFace = {
  card: Card;
  items: ContactItem[];
};

export type PortfolioChoice = {
  id: string;
  name: string;
  title: string;
  photoAttachmentId: string | null;
};

type RegistrationRow = {
  id: string;
  event_id: string;
  card_id: string;
  reg_token: string;
  consent_analytics: boolean;
  consent_connections: boolean;
};

function mapRegistration(row: RegistrationRow): EventRegistration {
  return {
    id: row.id,
    eventId: row.event_id,
    cardId: row.card_id,
    regToken: row.reg_token,
    consentAnalytics: row.consent_analytics,
    consentConnections: row.consent_connections,
  };
}

export async function loadOwnRegistration(eventId: string, userId: string): Promise<EventRegistration | null> {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("event_registrations")
    .select("id, event_id, card_id, reg_token, consent_analytics, consent_connections")
    .eq("event_id", eventId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapRegistration(data as RegistrationRow) : null;
}

export async function listOwnPortfolios(userId: string): Promise<PortfolioChoice[]> {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("cards")
    .select("id, display_name, title, photo_attachment_id")
    .eq("owner_id", userId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    id: row.id as string,
    name: ((row.display_name as string | null) ?? "").trim(),
    title: ((row.title as string | null) ?? "").trim(),
    photoAttachmentId: (row.photo_attachment_id as string | null) ?? null,
  }));
}

/** The participant's own card, including a draft. Other owners get nothing. */
export async function loadOwnedBadge(userId: string, cardId: string): Promise<BadgeFace | null> {
  if (!isUuid(cardId)) return null;
  const admin = createAdminSupabaseClient();
  const columns =
    "id, display_name, title, status, public_token, photo_attachment_id, created_at, updated_at, owner_id";
  const withHandle = await admin.from("cards").select(`${columns}, handle`).eq("id", cardId).maybeSingle();
  const loaded =
    withHandle.error && /handle/i.test(withHandle.error.message)
      ? await admin.from("cards").select(columns).eq("id", cardId).maybeSingle()
      : withHandle;
  if (loaded.error) throw new Error(loaded.error.message);
  const data = loaded.data;
  if (!data || data.owner_id !== userId) return null;

  const { data: linkData, error: linkError } = await admin
    .from("card_items")
    .select("item_id, sort_order")
    .eq("card_id", cardId)
    .eq("visible", true)
    .order("sort_order");
  if (linkError) throw new Error(linkError.message);
  const links = (linkData ?? []) as { item_id: string; sort_order: number }[];

  let itemRows: {
    id: string;
    type: string;
    label: string | null;
    value: string | null;
    url: string | null;
    attachment_id: string | null;
  }[] = [];
  if (links.length > 0) {
    const { data: itemsData, error: itemsError } = await admin
      .from("items")
      .select("id, type, label, value, url, attachment_id")
      .in(
        "id",
        links.map((link) => link.item_id),
      );
    if (itemsError) throw new Error(itemsError.message);
    itemRows = itemsData ?? [];
  }

  const byId = new Map(itemRows.map((item) => [item.id, item]));
  const items: ContactItem[] = [];
  for (const link of links) {
    const item = byId.get(link.item_id);
    if (!item) continue;
    const value = (item.value ?? "").trim();
    if (!value || value.startsWith("data:")) continue;
    const url = (item.url ?? "").trim();
    items.push({
      id: item.id,
      type: item.type as ContactType,
      label: item.label ?? "",
      value,
      url: /^(https?:|mailto:|tel:)/i.test(url) ? url : item.attachment_id ? `/f/${item.attachment_id}` : "",
      attachmentId: item.attachment_id ?? undefined,
      order: link.sort_order,
    });
  }

  const card: Card = {
    id: data.id as string,
    displayName: (data.display_name as string) ?? "",
    title: ((data.title as string | null) ?? "").trim(),
    status: asCardStatus(data.status as string),
    publicToken: data.public_token as string,
    handle: ((data as { handle?: string | null }).handle ?? "").trim().toLowerCase() || undefined,
    qrVersion: 1,
    photoAttachmentId: (data.photo_attachment_id as string | null) ?? undefined,
    contactItemIds: items.map((item) => item.id),
    nextScanAddons: [],
    createdAt: data.created_at as string,
    updatedAt: data.updated_at as string,
  };
  return { card, items };
}

/**
 * One row per person. A second Join returns the row already stored.
 * The card must belong to the caller; the stamp trigger checks the same thing.
 */
export async function registerForEvent(
  userId: string,
  lookup: string,
  cardId: string,
): Promise<{ ok: true; event: EventInvite; registration: EventRegistration } | { ok: false; status: number; error: string }> {
  const event = await loadEventInvite(lookup);
  if (!event) return { ok: false, status: 404, error: "Event not found" };
  if (!isUuid(cardId)) return { ok: false, status: 400, error: "Choose a portfolio." };

  const admin = createAdminSupabaseClient();
  const { data: card, error: cardError } = await admin
    .from("cards")
    .select("id, owner_id")
    .eq("id", cardId)
    .maybeSingle();
  if (cardError) throw new Error(cardError.message);
  if (!card || card.owner_id !== userId) return { ok: false, status: 403, error: "That portfolio is not yours." };

  const existing = await loadOwnRegistration(event.id, userId);
  if (existing) return { ok: true, event, registration: existing };

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { data, error } = await admin
      .from("event_registrations")
      .insert({
        event_id: event.id,
        user_id: userId,
        card_id: cardId,
        reg_token: nanoid(TOKEN_LENGTH),
      })
      .select("id, event_id, card_id, reg_token, consent_analytics, consent_connections")
      .single();
    if (!error && data) return { ok: true, event, registration: mapRegistration(data as RegistrationRow) };
    if (error?.code === "23505") {
      const raced = await loadOwnRegistration(event.id, userId);
      if (raced) return { ok: true, event, registration: raced };
      continue;
    }
    if (error && /card_not_yours/i.test(error.message)) {
      return { ok: false, status: 403, error: "That portfolio is not yours." };
    }
    throw new Error(error?.message ?? "Could not join.");
  }
  throw new Error("Could not join.");
}

/** Two counts for the organiser. Anyone else gets nothing. */
export async function loadOwnerEventCounts(
  eventId: string,
  viewerId: string | null,
): Promise<{ registered: number; checkedIn: number } | null> {
  if (!viewerId) return null;
  const admin = createAdminSupabaseClient();
  const { data: owned, error: ownerError } = await admin
    .from("events")
    .select("owner_id")
    .eq("id", eventId)
    .maybeSingle();
  if (ownerError) throw new Error(ownerError.message);
  if (owned?.owner_id !== viewerId) return null;

  const registered = await admin
    .from("event_registrations")
    .select("id", { count: "exact", head: true })
    .eq("event_id", eventId);
  if (registered.error) throw new Error(registered.error.message);
  const checkedIn = await admin
    .from("event_registrations")
    .select("id", { count: "exact", head: true })
    .eq("event_id", eventId)
    .not("checked_in_at", "is", null);
  if (checkedIn.error) throw new Error(checkedIn.error.message);
  return { registered: registered.count ?? 0, checkedIn: checkedIn.count ?? 0 };
}

export type BadgeOpen =
  | { kind: "missing" }
  | { kind: "badge"; name: string }
  | { kind: "checked-in"; name: string; at: string; already: boolean };

function badgeName(value: string | null | undefined): string {
  const name = (value ?? "").trim();
  return name || "Untitled";
}

/**
 * The address inside a badge QR. Only the event owner stamps arrival.
 * A second open leaves the first time in place.
 */
export async function openEventBadge(lookup: string, regToken: string, viewerId: string | null): Promise<BadgeOpen> {
  let token = regToken.trim();
  try {
    token = decodeURIComponent(token);
  } catch {
    return { kind: "missing" };
  }
  if (!REG_TOKEN.test(token)) return { kind: "missing" };

  const event = await loadEventInvite(lookup);
  if (!event) return { kind: "missing" };

  const admin = createAdminSupabaseClient();
  const { data: row, error } = await admin
    .from("event_registrations")
    .select("id, card_id, checked_in_at")
    .eq("event_id", event.id)
    .eq("reg_token", token)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) return { kind: "missing" };

  const { data: card, error: cardError } = await admin
    .from("cards")
    .select("display_name")
    .eq("id", row.card_id)
    .maybeSingle();
  if (cardError) throw new Error(cardError.message);
  const name = badgeName(card?.display_name as string | null | undefined);

  const { data: owned, error: ownerError } = await admin
    .from("events")
    .select("owner_id")
    .eq("id", event.id)
    .maybeSingle();
  if (ownerError) throw new Error(ownerError.message);
  const isOwner = Boolean(viewerId && owned?.owner_id === viewerId);
  if (!isOwner) return { kind: "badge", name };

  let at = (row.checked_in_at as string | null) ?? null;
  let already = Boolean(at);
  if (!at) {
    const now = new Date().toISOString();
    const stamped = await admin
      .from("event_registrations")
      .update({ checked_in_at: now })
      .eq("id", row.id)
      .is("checked_in_at", null)
      .select("checked_in_at")
      .maybeSingle();
    if (stamped.error) throw new Error(stamped.error.message);
    if (stamped.data?.checked_in_at) {
      at = stamped.data.checked_in_at as string;
    } else {
      const again = await admin.from("event_registrations").select("checked_in_at").eq("id", row.id).maybeSingle();
      if (again.error) throw new Error(again.error.message);
      at = (again.data?.checked_in_at as string | null) ?? now;
      already = true;
    }
  }
  return { kind: "checked-in", name, at: at ?? new Date().toISOString(), already };
}

export async function saveRegistrationConsent(
  userId: string,
  lookup: string,
  consent: { analytics: boolean; connections: boolean },
): Promise<{ ok: true; registration: EventRegistration } | { ok: false; status: number; error: string }> {
  const event = await loadEventInvite(lookup);
  if (!event) return { ok: false, status: 404, error: "Event not found" };
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("event_registrations")
    .update({
      consent_analytics: consent.analytics,
      consent_connections: consent.connections,
    })
    .eq("event_id", event.id)
    .eq("user_id", userId)
    .select("id, event_id, card_id, reg_token, consent_analytics, consent_connections")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return { ok: false, status: 404, error: "Join the event first." };
  return { ok: true, registration: mapRegistration(data as RegistrationRow) };
}

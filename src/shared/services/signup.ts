import { nanoid } from "nanoid";
import { createAdminSupabaseClient } from "@/shared/lib/supabase/admin";
import { slugFromName, uniqueHandle } from "@/shared/services/card-handle";
import { createEmptyContactItem, normalizeContactItem } from "@/shared/services/contact-item";
import { isEventLookup } from "@/shared/event/lookup";
import { isEmail, userIdForEmail } from "@/shared/services/email-signup";
import { isGuestToken } from "@/shared/services/event-guest-pass";
import { loadEventInvite } from "@/shared/services/event-invite";
import { eventListStatus } from "@/shared/services/events";
import { joinWithOwnCard, PASSWORD_SET } from "@/shared/services/guest-accept";
import { ATTACHMENT_TYPES, type AttachmentContactType } from "@/shared/services/portfolio-limits";
import { saveConnection } from "@/shared/services/save-connection";
import { sendWelcomeMail } from "@/shared/services/cold-entry";
import { isProseValue } from "@/shared/services/card-zones";

export const MIN_PASSWORD = 8;

const ZONE_ID = /^(?:name|age|company|position|background|education|location|languages|web|social|contact|files|lifestyle|about|extra-\d+)$/;

type SignupRow = { key?: unknown; value?: unknown; type?: unknown };
type SignupZone = { id?: unknown; title?: unknown; rows?: unknown };

const PUBLIC_TOKEN = /^[A-Za-z0-9_-]{16,64}$/;

export type SignupBody = {
  email?: unknown;
  password?: unknown;
  /** Public token of someone else's card. Comes only from `/create?card=`, which our own screens build. */
  sourceToken?: unknown;
  /** Event lookup from `/create?event=`. `guestToken` is only carried through; the form does not read the guest. */
  event?: { lookup?: unknown; guestToken?: unknown };
  card?: {
    displayName?: unknown;
    rubricOrder?: unknown;
    rubricLabels?: unknown;
    zones?: unknown;
    /** Entry row key lifted under the name. Position or Company only. */
    headerKey?: unknown;
  };
};

export type SignupFileItem = { key: string; itemId: string };

export type SignupResult =
  | {
      ok: true;
      status: 201;
      cardId: string;
      publicToken: string;
      fileItems: SignupFileItem[];
      /** Every saved row, in card order. The new portfolio places them before the first hydrate. */
      itemIds: string[];
      itemZones: Record<string, string>;
      /** The lifted row, so the new portfolio opens with it under the name. */
      headerItemId?: string;
      headerTitle?: string;
      /** The other person's card is in this account's book. */
      saved?: boolean;
      savedName?: string;
      /** The new account is on the event list. `pay` opens the payment screen. */
      joined?: boolean;
      pay?: boolean;
      eventLookup?: string;
      /** The account exists. A door did not. The client opens the portfolio. */
      warning?: string;
    }
  | { ok: false; status: number; error: string; kind?: "login" };

function emailTaken(error: { message?: string; code?: string } | null) {
  const text = `${error?.code ?? ""} ${error?.message ?? ""}`.toLowerCase();
  return text.includes("already") || text.includes("email_exists") || text.includes("duplicate");
}

function attachmentKind(type: unknown): AttachmentContactType | null {
  if (typeof type !== "string") return null;
  return (ATTACHMENT_TYPES as readonly string[]).includes(type) ? (type as AttachmentContactType) : null;
}

function readZones(input: unknown): { id: string; title: string; rows: { key: string; value: string; type: AttachmentContactType | null }[] }[] | null {
  if (!Array.isArray(input)) return [];
  const zones = [];
  const seenKeys = new Set<string>();
  for (const entry of input as SignupZone[]) {
    if (!entry || typeof entry !== "object") return null;
    const id = typeof entry.id === "string" ? entry.id.trim() : "";
    if (!ZONE_ID.test(id)) return null;
    const title = typeof entry.title === "string" ? entry.title.trim().slice(0, 80) : "";
    if (!Array.isArray(entry.rows)) return null;
    const rows = [];
    for (const row of entry.rows as SignupRow[]) {
      if (!row || typeof row !== "object") return null;
      const key = typeof row.key === "string" ? row.key.trim() : "";
      const value = typeof row.value === "string" ? row.value.trim() : "";
      if (!key || key.length > 80 || seenKeys.has(key)) return null;
      if (!value) continue;
      seenKeys.add(key);
      const type = attachmentKind(row.type);
      if (row.type != null && row.type !== "" && !type) return null;
      rows.push({ key, value: value.slice(0, 2000), type });
    }
    zones.push({ id, title, rows });
  }
  return zones;
}

/** A failed save leaves the new account in place. The caller opens the portfolio instead of Network. */
async function keepSourceCard(
  admin: ReturnType<typeof createAdminSupabaseClient>,
  userId: string,
  sourceToken: unknown,
): Promise<{ saved?: boolean; savedName?: string; warning?: string }> {
  const token = typeof sourceToken === "string" ? sourceToken.trim() : "";
  if (!PUBLIC_TOKEN.test(token)) return {};
  try {
    const found = await admin
      .from("cards")
      .select("id, owner_id, display_name")
      .eq("public_token", token)
      .maybeSingle();
    if (found.error || !found.data || found.data.owner_id === userId) return { warning: "card" };
    const saved = await saveConnection({ ownerId: userId, cardId: found.data.id });
    if (!saved.ok) return { warning: "card" };
    const raw = found.data.display_name;
    const savedName = (typeof raw === "string" ? raw.trim() : "") || "Untitled";
    return { saved: true, savedName };
  } catch (error) {
    console.error("[signup] card", error instanceof Error ? error.message : error);
    return { warning: "card" };
  }
}

/** A failed join leaves the new account in place. The caller opens the portfolio instead of the event. */
async function joinEvent(
  userId: string,
  cardId: string,
  event: SignupBody["event"],
): Promise<{ joined?: boolean; pay?: boolean; eventLookup?: string; warning?: string }> {
  const lookup = typeof event?.lookup === "string" ? event.lookup.trim() : "";
  if (!lookup) return {};
  if (!isEventLookup(lookup)) return { warning: "event" };
  const rawGuest = event?.guestToken;
  const guestToken = isGuestToken(rawGuest) ? rawGuest : null;
  if (rawGuest != null && rawGuest !== "" && !guestToken) return { warning: "event" };
  try {
    const invite = await loadEventInvite(lookup);
    if (!invite || eventListStatus(invite.date, Date.now(), invite.endsAt) === "past") {
      console.error("[signup] event", invite ? "ended" : "missing");
      return { warning: "event" };
    }
    const joined = await joinWithOwnCard(userId, invite, lookup, guestToken, cardId);
    if (!joined.ok || !joined.registrationId) {
      console.error("[signup] event", joined.ok ? "no registration" : joined.error);
      return { warning: "event" };
    }
    return { joined: true, pay: joined.pay, eventLookup: invite.slug?.trim() || invite.code };
  } catch (error) {
    console.error("[signup] event", error instanceof Error ? error.message : error);
    return { warning: "event" };
  }
}

/** Create the account and its first card. Auth is created first; a failed write deletes that user. */
export async function createSignup(body: SignupBody, origin = ""): Promise<SignupResult> {
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const displayName = typeof body.card?.displayName === "string" ? body.card.displayName.trim() : "";
  if (!displayName) return { ok: false, status: 400, error: "Add a title." };
  if (!email || email.length > 254 || !isEmail(email)) return { ok: false, status: 400, error: "Add your email." };
  if (password.length < MIN_PASSWORD) {
    return { ok: false, status: 400, error: `Use at least ${MIN_PASSWORD} characters for the password.` };
  }

  const zones = readZones(body.card?.zones);
  if (!zones) return { ok: false, status: 400, error: "Could not create your profile." };
  const headerKey = typeof body.card?.headerKey === "string" ? body.card.headerKey.trim() : "";
  const headerRow = headerKey
    ? zones
        .filter((zone) => zone.id === "position" || zone.id === "company")
        .flatMap((zone) => zone.rows)
        .find((row) => row.key === headerKey && !isProseValue(row.value))
    : undefined;

  const admin = createAdminSupabaseClient();
  if (await userIdForEmail(email)) {
    return { ok: false, status: 409, error: "This email already has an account.", kind: "login" };
  }
  const made = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { [PASSWORD_SET]: new Date().toISOString() },
  });
  if (made.error || !made.data.user) {
    if (emailTaken(made.error)) return { ok: false, status: 409, error: "This email already has an account.", kind: "login" };
    return { ok: false, status: 500, error: "Could not create the account." };
  }

  const userId = made.data.user.id;
  const cardId = crypto.randomUUID();
  try {
    const now = new Date().toISOString();
    const marked = await admin.from("profiles").upsert({ id: userId, registered_at: now }, { onConflict: "id" });
    if (marked.error) throw new Error(marked.error.message);

    const labels: Record<string, string> = {};
    for (const zone of zones) {
      if (zone.title) labels[zone.id] = zone.title;
    }
    const order = zones.map((zone) => zone.id);
    const base = slugFromName(displayName);
    let handle: string | null = null;
    if (base) {
      const taken = await admin.from("cards").select("handle").ilike("handle", `${base}%`);
      const used = new Set(
        ((taken.data ?? []) as { handle: string | null }[])
          .map((row) => row.handle?.trim().toLowerCase())
          .filter((value): value is string => Boolean(value)),
      );
      handle = uniqueHandle(base, used);
    }

    const publicToken = nanoid(21);
    const card = await admin.from("cards").insert({
      id: cardId,
      owner_id: userId,
      display_name: displayName,
      title: "",
      status: "published",
      public_token: publicToken,
      handle,
      qr_version: 1,
      is_public: true,
      is_primary: true,
      listed: true,
      rubric_order: order,
      rubric_labels: Object.keys(labels).length > 0 ? labels : null,
      created_at: now,
      updated_at: now,
    });
    if (card.error) throw new Error(card.error.message);

    const itemZones: Record<string, string> = {};
    const itemIds: string[] = [];
    const fileItems: SignupFileItem[] = [];
    let headerItemId = "";
    let sort = 0;
    for (const zone of zones) {
      for (const row of zone.rows) {
        const id = crypto.randomUUID();
        if (row.type) {
          const saved = await admin.from("items").insert({
            id,
            owner_id: userId,
            type: row.type,
            label: "",
            value: row.value,
            url: "",
          });
          if (saved.error) throw new Error(saved.error.message);
          fileItems.push({ key: row.key, itemId: id });
          if (headerRow && row.key === headerRow.key) headerItemId = id;
        } else {
          const normalized = normalizeContactItem(createEmptyContactItem(sort), row.value);
          const saved = await admin.from("items").insert({
            id: normalized.id,
            owner_id: userId,
            type: normalized.type,
            label: normalized.label,
            value: normalized.value,
            url: normalized.url,
          });
          if (saved.error) throw new Error(saved.error.message);
          itemZones[normalized.id] = zone.id;
          itemIds.push(normalized.id);
          if (headerRow && row.key === headerRow.key) headerItemId = normalized.id;
          const link = await admin.from("card_items").insert({
            card_id: cardId,
            item_id: normalized.id,
            sort_order: sort,
            visible: true,
          });
          if (link.error) throw new Error(link.error.message);
          sort += 1;
          continue;
        }
        const link = await admin.from("card_items").insert({
          card_id: cardId,
          item_id: id,
          sort_order: sort,
          visible: true,
        });
        if (link.error) throw new Error(link.error.message);
        itemZones[id] = zone.id;
        itemIds.push(id);
        sort += 1;
      }
    }
    if (Object.keys(itemZones).length > 0) {
      const zoned = await admin.from("cards").update({ item_zones: itemZones }).eq("id", cardId);
      if (zoned.error && !/item_zones/i.test(zoned.error.message)) throw new Error(zoned.error.message);
    }
    if (headerItemId && headerRow) {
      const titled = await admin.from("cards").update({ title: headerRow.value }).eq("id", cardId);
      if (titled.error) throw new Error(titled.error.message);
    }

    const door = await keepSourceCard(admin, userId, body.sourceToken);
    const eventDoor = await joinEvent(userId, cardId, body.event);
    if (origin) {
      void sendWelcomeMail(userId, cardId, password, origin).catch((error) => {
        console.error("[mail] welcome", error instanceof Error ? error.message : error);
      });
    }
    return {
      ok: true,
      status: 201,
      cardId,
      publicToken,
      fileItems,
      itemIds,
      itemZones,
      ...(headerItemId && headerRow ? { headerItemId, headerTitle: headerRow.value } : {}),
      ...door,
      ...eventDoor,
    };
  } catch (error) {
    await admin.auth.admin.deleteUser(userId);
    console.error("[signup]", error instanceof Error ? error.message : error);
    return { ok: false, status: 500, error: "Could not create your profile." };
  }
}

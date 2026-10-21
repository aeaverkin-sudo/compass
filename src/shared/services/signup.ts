import { nanoid } from "nanoid";
import { createAdminSupabaseClient } from "@/shared/lib/supabase/admin";
import { slugFromName, uniqueHandle } from "@/shared/services/card-handle";
import { createEmptyContactItem, normalizeContactItem } from "@/shared/services/contact-item";
import { isEmail, userIdForEmail } from "@/shared/services/email-signup";
import { PASSWORD_SET } from "@/shared/services/guest-accept";
import { ATTACHMENT_TYPES, type AttachmentContactType } from "@/shared/services/portfolio-limits";

export const MIN_PASSWORD = 8;

const ZONE_ID = /^(?:name|age|company|position|background|education|location|languages|web|social|contact|files|lifestyle|about|extra-\d+)$/;

type SignupRow = { key?: unknown; value?: unknown; type?: unknown };
type SignupZone = { id?: unknown; title?: unknown; rows?: unknown };

export type SignupBody = {
  email?: unknown;
  password?: unknown;
  card?: {
    displayName?: unknown;
    rubricOrder?: unknown;
    rubricLabels?: unknown;
    zones?: unknown;
  };
};

export type SignupFileItem = { key: string; itemId: string };

export type SignupResult =
  | { ok: true; status: 201; cardId: string; fileItems: SignupFileItem[] }
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

/** Create the account and its first card. Auth is created first; a failed write deletes that user. */
export async function createSignup(body: SignupBody): Promise<SignupResult> {
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

    const card = await admin.from("cards").insert({
      id: cardId,
      owner_id: userId,
      display_name: displayName,
      title: "",
      status: "published",
      public_token: nanoid(21),
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
    const fileItems: SignupFileItem[] = [];
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
        sort += 1;
      }
    }
    if (Object.keys(itemZones).length > 0) {
      const zoned = await admin.from("cards").update({ item_zones: itemZones }).eq("id", cardId);
      if (zoned.error && !/item_zones/i.test(zoned.error.message)) throw new Error(zoned.error.message);
    }

    return { ok: true, status: 201, cardId, fileItems };
  } catch (error) {
    await admin.auth.admin.deleteUser(userId);
    console.error("[signup]", error instanceof Error ? error.message : error);
    return { ok: false, status: 500, error: "Could not create your profile." };
  }
}

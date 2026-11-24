import "server-only";

import { createAdminSupabaseClient } from "@/shared/lib/supabase/admin";
import { sessionUser } from "@/shared/lib/supabase/session-user";
import { downloadAttachmentBytes, safeOriginalName, type AttachmentRow } from "@/shared/services/attachment-api";
import {
  EXPORT_README,
  contactFileRefs,
  fileBelongsToOwner,
  ownedAttachmentId,
  zipEnd,
  zipEntry,
  type ZipEntry,
} from "@/shared/services/account-export-format";

const CARD_FIELDS = [
  "id",
  "display_name",
  "title",
  "status",
  "public_token",
  "handle",
  "photo_attachment_id",
  "photo_look",
  "rubric_order",
  "rubric_labels",
  "item_zones",
  "created_at",
  "updated_at",
  "is_primary",
] as const;

const ITEM_FIELDS = ["id", "type", "label", "value", "url", "attachment_id"] as const;

const CONTACT_FIELDS = [
  "id",
  "display_name",
  "position",
  "company",
  "header_field",
  "note",
  "about",
  "event_tag",
  "source",
  "lines",
  "web",
  "social",
  "files",
  "photo_attachment_id",
  "created_at",
  "updated_at",
  "pushback_at",
  "pushback_channel",
  "pushback_card_id",
] as const;

type Row = Record<string, unknown>;

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

function providerOf(identities: { provider?: string }[] | null | undefined) {
  const providers = new Set((identities ?? []).map((identity) => identity.provider));
  if (providers.has("email")) return "email";
  if (providers.has("google")) return "google";
  if (providers.has("apple")) return "apple";
  return null;
}

async function ownedRows(table: string, ownerColumn: string, ownerId: string, fields: readonly string[]) {
  const admin = createAdminSupabaseClient();
  let selected = [...fields];
  for (;;) {
    const loaded = await admin.from(table).select(selected.join(", ")).eq(ownerColumn, ownerId);
    if (!loaded.error) return (loaded.data ?? []) as unknown as Row[];
    const missing = selected.find((column) => new RegExp(column, "i").test(loaded.error.message));
    if (!missing || !/column|schema/i.test(loaded.error.message)) throw new Error(loaded.error.message);
    selected = selected.filter((column) => column !== missing);
  }
}

function zipFileName(folder: string, id: string, original: string | null) {
  const base = (safeOriginalName(original) ?? "file").replace(/[^\w.\- ()]+/g, "_");
  return `${folder}/${id}/${base}`;
}

/** The account document. Callers already checked that every row belongs to this owner. */
export function accountDocument(input: {
  id: string;
  email: string | null;
  provider: string | null;
  registeredAt: string | null;
  consent: { version: string; acceptedAt: string | null } | null;
  portfolios: Row[];
  library: Row[];
  links: { cardId: string; itemId: string; sortOrder: number | null }[];
  contacts: Row[];
  ownedFileIds: ReadonlySet<string>;
}) {
  return {
    account: {
      id: input.id,
      email: input.email,
      provider: input.provider,
      registeredAt: input.registeredAt,
      consent: input.consent,
    },
    portfolios: input.portfolios.map((row) => ({
      id: text(row.id),
      displayName: text(row.display_name),
      title: text(row.title),
      status: text(row.status),
      publicToken: text(row.public_token),
      handle: text(row.handle),
      photoAttachmentId: text(row.photo_attachment_id) || null,
      photoLook: text(row.photo_look) || null,
      rubricOrder: row.rubric_order ?? null,
      rubricLabels: row.rubric_labels ?? null,
      itemZones: row.item_zones ?? null,
      primary: row.is_primary === true,
      createdAt: text(row.created_at),
      updatedAt: text(row.updated_at),
    })),
    library: input.library.map((row) => ({
      id: text(row.id),
      type: text(row.type),
      label: text(row.label),
      value: text(row.value),
      url: text(row.url),
      attachmentId: text(row.attachment_id) || null,
    })),
    portfolioItems: input.links,
    manualContacts: input.contacts.map((row) => ({
      id: text(row.id),
      displayName: text(row.display_name),
      position: text(row.position),
      company: text(row.company),
      headerField: text(row.header_field) || null,
      note: text(row.note),
      about: text(row.about),
      eventTag: text(row.event_tag),
      source: text(row.source),
      lines: Array.isArray(row.lines) ? row.lines : [],
      web: Array.isArray(row.web) ? row.web : [],
      social: Array.isArray(row.social) ? row.social : [],
      files: contactFileRefs(
        input.id,
        Array.isArray(row.files) ? (row.files as { id?: unknown; name?: unknown }[]) : [],
        input.ownedFileIds,
      ),
      photoAttachmentId: ownedAttachmentId(row.photo_attachment_id, input.ownedFileIds),
      createdAt: text(row.created_at),
      updatedAt: text(row.updated_at),
      pushbackAt: text(row.pushback_at) || null,
      pushbackChannel: text(row.pushback_channel) || null,
      pushbackCardId: text(row.pushback_card_id) || null,
    })),
  };
}

/**
 * Bytes of this account's copy. The first failure throws before a file from someone else can be added.
 * Network cards that belong to other people are not queried.
 */
export async function* accountExportParts(ownerId: string): AsyncGenerator<Uint8Array> {
  const user = await sessionUser();
  if (!user || user.id !== ownerId) throw new Error("Sign in to download your data.");
  const admin = createAdminSupabaseClient();
  const [profileRows, cards, library, contacts, attachmentRows, consentResult] = await Promise.all([
    ownedRows("profiles", "id", ownerId, ["registered_at"]),
    ownedRows("cards", "owner_id", ownerId, CARD_FIELDS),
    ownedRows("items", "owner_id", ownerId, ITEM_FIELDS),
    ownedRows("external_contacts", "owner_id", ownerId, CONTACT_FIELDS),
    ownedRows("attachments", "owner_id", ownerId, [
      "id",
      "owner_id",
      "bucket",
      "storage_path",
      "mime",
      "byte_size",
      "original_name",
      "status",
    ]),
    admin
      .from("consents")
      .select("document_version, accepted_at")
      .eq("user_id", ownerId)
      .order("accepted_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (consentResult.error && !/column|schema|relation/i.test(consentResult.error.message)) {
    throw new Error(consentResult.error.message);
  }

  const cardIds = new Set(cards.map((row) => text(row.id)).filter(Boolean));
  const itemIds = new Set(library.map((row) => text(row.id)).filter(Boolean));
  let links: { cardId: string; itemId: string; sortOrder: number | null }[] = [];
  if (cardIds.size > 0) {
    const linked = await admin.from("card_items").select("card_id, item_id, sort_order").in("card_id", [...cardIds]);
    if (linked.error) throw new Error(linked.error.message);
    links = ((linked.data ?? []) as { card_id: string; item_id: string; sort_order: number | null }[])
      .filter((row) => cardIds.has(row.card_id) && itemIds.has(row.item_id))
      .map((row) => ({ cardId: row.card_id, itemId: row.item_id, sortOrder: row.sort_order }));
  }

  const ownedFiles = (attachmentRows as unknown as AttachmentRow[]).filter((row) =>
    fileBelongsToOwner(ownerId, row),
  );
  const ownedFileIds = new Set(ownedFiles.map((row) => row.id));
  const consent = consentResult.data;
  const document = accountDocument({
    id: ownerId,
    email: user.email ?? null,
    provider: providerOf(user.identities),
    registeredAt: text(profileRows[0]?.registered_at) || user.created_at || null,
    consent:
      consent && typeof consent.document_version === "string"
        ? { version: consent.document_version, acceptedAt: text(consent.accepted_at) || null }
        : null,
    portfolios: cards,
    library,
    links,
    contacts,
    ownedFileIds,
  });

  const centrals: Uint8Array[] = [];
  let offset = 0;
  let count = 0;
  const push = function* (name: string, data: Uint8Array): Generator<Uint8Array> {
    const entry: ZipEntry = zipEntry({ name, data }, offset);
    offset = entry.next;
    count += 1;
    centrals.push(entry.central);
    yield* entry.parts;
  };
  const encoder = new TextEncoder();
  yield* push("README.txt", encoder.encode(EXPORT_README));
  yield* push("account.json", encoder.encode(`${JSON.stringify(document, null, 2)}\n`));
  for (const row of ownedFiles) {
    if (row.status !== "ready") continue;
    const bytes = await downloadAttachmentBytes(row);
    if (!bytes) throw new Error("Could not read a file.");
    const folder = contacts.some((contact) => contactFileUses(contact, row.id)) ? "contacts" : "files";
    yield* push(zipFileName(folder, row.id, row.original_name), bytes);
  }
  yield* zipEnd(centrals, offset, count);
}

function contactFileUses(contact: Row, attachmentId: string) {
  if (contact.photo_attachment_id === attachmentId) return true;
  return Array.isArray(contact.files) && contact.files.some((file) => file && typeof file === "object" && (file as { id?: unknown }).id === attachmentId);
}


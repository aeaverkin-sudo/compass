import {
  EXPORT_README,
  contactFileRefs,
  fileBelongsToOwner,
  optionalColumnToDrop,
  ownedAttachmentId,
  readAllPages,
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

const CARD_OPTIONAL = ["handle", "photo_look", "rubric_order", "rubric_labels", "item_zones", "is_primary"] as const;

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

const CONTACT_OPTIONAL = [
  "header_field",
  "about",
  "web",
  "social",
  "files",
  "pushback_at",
  "pushback_channel",
  "pushback_card_id",
] as const;

const ATTACHMENT_FIELDS = [
  "id",
  "owner_id",
  "bucket",
  "storage_path",
  "mime",
  "byte_size",
  "original_name",
  "status",
] as const;

const LINK_CHUNK = 80;

type Row = Record<string, unknown>;

export type ExportRows = { data: unknown[] | null; error: { message: string } | null };
export type ExportOne = { data: Record<string, unknown> | null; error: { message: string } | null };

export type ExportFilter = {
  eq: (column: string, value: string) => ExportFilter;
  in: (column: string, values: readonly string[]) => ExportFilter;
  order: (column: string, options?: { ascending?: boolean }) => ExportFilter;
  limit: (count: number) => ExportFilter;
  range: (from: number, to: number) => PromiseLike<ExportRows>;
  maybeSingle: () => PromiseLike<ExportOne>;
};

export type ExportQuery = {
  select: (columns: string) => ExportFilter;
};

export type ExportDatabase = {
  from: (table: string) => ExportQuery;
};

export type ExportUser = {
  id: string;
  email?: string | null;
  created_at?: string;
  identities?: { provider?: string }[] | null;
};

export type ExportAttachment = {
  id: string;
  owner_id: string;
  bucket: string;
  storage_path: string;
  mime: string;
  byte_size: number;
  original_name: string | null;
  status: "pending" | "ready";
};

export type ExportPackedFile = { id: string; name: string; path: string };

type ExportLink = { cardId: string; itemId: string; sortOrder: number | null };

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

function safeOriginalName(name: unknown): string | null {
  if (typeof name !== "string") return null;
  const base = name.split(/[/\\]/).pop()?.replace(/[\u0000-\u001f]/g, "").trim() ?? "";
  if (!base) return null;
  return base.slice(0, 180);
}

function zipFileName(folder: string, id: string, original: string | null) {
  const base = (safeOriginalName(original) ?? "file").replace(/[^\w.\- ()]+/g, "_");
  return `${folder}/${id}/${base}`;
}

/** The account document. File ids here are the files whose bytes are packed in the same zip. */
export function accountDocument(input: {
  id: string;
  email: string | null;
  provider: string | null;
  registeredAt: string | null;
  consent: { version: string; acceptedAt: string | null } | null;
  files: ExportPackedFile[];
  portfolios: Row[];
  library: Row[];
  links: ExportLink[];
  contacts: Row[];
}) {
  const packed = new Set(input.files.map((file) => file.id));
  return {
    account: {
      id: input.id,
      email: input.email,
      provider: input.provider,
      registeredAt: input.registeredAt,
      consent: input.consent,
    },
    files: input.files,
    portfolios: input.portfolios.map((row) => ({
      id: text(row.id),
      displayName: text(row.display_name),
      title: text(row.title),
      status: text(row.status),
      publicToken: text(row.public_token),
      handle: text(row.handle),
      photoAttachmentId: ownedAttachmentId(row.photo_attachment_id, packed),
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
      attachmentId: ownedAttachmentId(row.attachment_id, packed),
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
        packed,
      ),
      photoAttachmentId: ownedAttachmentId(row.photo_attachment_id, packed),
      createdAt: text(row.created_at),
      updatedAt: text(row.updated_at),
      pushbackAt: text(row.pushback_at) || null,
      pushbackChannel: text(row.pushback_channel) || null,
      pushbackCardId: text(row.pushback_card_id) || null,
    })),
  };
}

async function ownedRows(
  database: ExportDatabase,
  table: string,
  ownerColumn: string,
  ownerId: string,
  fields: readonly string[],
  optional: readonly string[],
) {
  let selected = [...fields];
  for (;;) {
    try {
      const rows = await readAllPages((from, to) =>
        database
          .from(table)
          .select(selected.join(", "))
          .eq(ownerColumn, ownerId)
          .order("id", { ascending: true })
          .range(from, to),
      );
      if (selected.includes("id")) {
        for (const row of rows) {
          if (typeof row.id !== "string" || !row.id) throw new Error("Could not read your data.");
        }
      }
      return rows;
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      const missing = optionalColumnToDrop(message, selected, optional);
      if (!missing) throw error instanceof Error ? error : new Error("Could not read your data.");
      selected = selected.filter((column) => column !== missing);
    }
  }
}

async function portfolioLinks(database: ExportDatabase, cardIds: string[], itemIds: Set<string>) {
  const links: ExportLink[] = [];
  const ownedCards = new Set(cardIds);
  for (let index = 0; index < cardIds.length; index += LINK_CHUNK) {
    const slice = cardIds.slice(index, index + LINK_CHUNK);
    const rows = await readAllPages((from, to) =>
      database
        .from("card_items")
        .select("card_id, item_id, sort_order")
        .in("card_id", slice)
        .order("card_id", { ascending: true })
        .order("item_id", { ascending: true })
        .range(from, to),
    );
    for (const row of rows) {
      const cardId = text(row.card_id);
      const itemId = text(row.item_id);
      if (!ownedCards.has(cardId) || !itemIds.has(itemId)) continue;
      links.push({
        cardId,
        itemId,
        sortOrder: typeof row.sort_order === "number" ? row.sort_order : null,
      });
    }
  }
  return links;
}

function attachmentOf(row: Row): ExportAttachment | null {
  if (typeof row.id !== "string" || typeof row.owner_id !== "string") return null;
  if (typeof row.bucket !== "string" || typeof row.storage_path !== "string") return null;
  if (row.status !== "ready" && row.status !== "pending") return null;
  return {
    id: row.id,
    owner_id: row.owner_id,
    bucket: row.bucket,
    storage_path: row.storage_path,
    mime: typeof row.mime === "string" ? row.mime : "",
    byte_size: typeof row.byte_size === "number" ? row.byte_size : 0,
    original_name: typeof row.original_name === "string" ? row.original_name : null,
    status: row.status,
  };
}

function contactFileUses(contact: Row, attachmentId: string) {
  if (contact.photo_attachment_id === attachmentId) return true;
  return (
    Array.isArray(contact.files) &&
    contact.files.some((file) => file && typeof file === "object" && (file as { id?: unknown }).id === attachmentId)
  );
}

/**
 * Bytes of this account's copy. A failed page or a missing file throws before the zip is finished.
 * Network cards that belong to other people are not queried.
 */
export async function* runAccountExport(input: {
  ownerId: string;
  user: ExportUser | null;
  database: ExportDatabase;
  download: (row: ExportAttachment) => Promise<Uint8Array | null>;
}): AsyncGenerator<Uint8Array> {
  const { ownerId, user, database, download } = input;
  if (!user || user.id !== ownerId) throw new Error("Sign in to download your data.");

  const [profileRows, cards, library, contacts, attachmentRows, consentResult] = await Promise.all([
    ownedRows(database, "profiles", "id", ownerId, ["registered_at"], []),
    ownedRows(database, "cards", "owner_id", ownerId, CARD_FIELDS, CARD_OPTIONAL),
    ownedRows(database, "items", "owner_id", ownerId, ITEM_FIELDS, []),
    ownedRows(database, "external_contacts", "owner_id", ownerId, CONTACT_FIELDS, CONTACT_OPTIONAL),
    ownedRows(database, "attachments", "owner_id", ownerId, ATTACHMENT_FIELDS, []),
    database
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

  const cardIds = cards.map((row) => text(row.id)).filter(Boolean);
  const itemIds = new Set(library.map((row) => text(row.id)).filter(Boolean));
  const links = cardIds.length > 0 ? await portfolioLinks(database, cardIds, itemIds) : [];

  const ownedFiles = attachmentRows
    .map(attachmentOf)
    .filter((row): row is ExportAttachment => row !== null && fileBelongsToOwner(ownerId, row));
  const ready = ownedFiles.filter((row) => row.status === "ready");
  const packed = ready.map((row) => {
    const folder = contacts.some((contact) => contactFileUses(contact, row.id)) ? "contacts" : "files";
    const path = zipFileName(folder, row.id, row.original_name);
    return { row, path, name: path.split("/").pop() ?? "file" };
  });
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
    files: packed.map((file) => ({ id: file.row.id, name: file.name, path: file.path })),
    portfolios: cards,
    library,
    links,
    contacts,
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
  for (const file of packed) {
    const bytes = await download(file.row);
    if (!bytes) throw new Error("Could not read a file.");
    yield* push(file.path, bytes);
  }
  yield* push("account.json", encoder.encode(`${JSON.stringify(document, null, 2)}\n`));
  yield* zipEnd(centrals, offset, count);
}

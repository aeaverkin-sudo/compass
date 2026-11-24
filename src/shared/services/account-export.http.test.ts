import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import test from "node:test";
import { EXPORT_PAGE_SIZE } from "./account-export-format.ts";
import { streamAccountExport } from "./account-export-response.ts";
import { runAccountExport, type ExportAttachment, type ExportDatabase } from "./account-export-run.ts";

const OWNER_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OWNER_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OWNER_BROKEN = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const OWNER_UNREADABLE = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const CARD_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const CARD_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1";
const READY = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3";
const BIG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4";
const PENDING = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5";
const FOREIGN = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2";
const B_FILE = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3";
const UNREADABLE = "dddddddd-dddd-4ddd-8ddd-ddddddddddd1";
const BIG_BYTES = 2 * 1024 * 1024;

const CARD_COLUMNS = [
  "id",
  "owner_id",
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
];
const CONTACT_COLUMNS = [
  "id",
  "owner_id",
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
];
const ITEM_COLUMNS = ["id", "owner_id", "type", "label", "value", "url", "attachment_id"];
const FILE_COLUMNS = ["id", "owner_id", "bucket", "storage_path", "mime", "byte_size", "original_name", "status"];

type Row = Record<string, unknown>;
type Table = { columns: string[]; rows: Row[] };

function without(columns: string[], missing: string[]) {
  const gone = new Set(missing);
  return columns.filter((column) => !gone.has(column));
}

function card(row: Row): Row {
  return {
    display_name: "Card",
    title: "",
    status: "draft",
    public_token: "token",
    photo_attachment_id: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-02T00:00:00.000Z",
    ...row,
  };
}

function contact(row: Row): Row {
  return {
    display_name: "Contact",
    position: "",
    company: "",
    note: "",
    about: "",
    event_tag: "",
    source: "manual",
    lines: [],
    web: [],
    social: [],
    files: [],
    photo_attachment_id: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-02T00:00:00.000Z",
    ...row,
  };
}

function item(row: Row): Row {
  return { type: "text", label: "Note", value: "", url: "", attachment_id: null, ...row };
}

function file(row: Row): Row {
  return { bucket: "card-attachments", mime: "application/pdf", byte_size: 4, original_name: "file.pdf", status: "ready", ...row };
}

function pagesOf(owner: string, count: number, attachmentId: string | null) {
  return Array.from({ length: count }, (_, index) => {
    const id = `${owner.slice(0, 8)}-item-${String(index).padStart(4, "0")}`;
    return item({
      id,
      owner_id: owner,
      value: `value-${index}`,
      attachment_id: index === 0 ? attachmentId : null,
    });
  });
}

const itemsA = pagesOf(OWNER_A, EXPORT_PAGE_SIZE + 1, BIG);
const itemsB = pagesOf(OWNER_B, 1, B_FILE);

function linksFor(cardId: string, items: Row[]) {
  return items.map((row, index) => ({ card_id: cardId, item_id: row.id, sort_order: index }));
}

function liveTables(): Record<string, Table> {
  const oldCards = without(CARD_COLUMNS, ["handle", "photo_look", "rubric_order", "rubric_labels", "item_zones", "is_primary"]);
  const oldContacts = without(CONTACT_COLUMNS, ["header_field", "pushback_at", "pushback_channel", "pushback_card_id"]);
  return {
    profiles: {
      columns: ["id", "registered_at"],
      rows: [
        { id: OWNER_A, registered_at: "2026-01-01T00:00:00.000Z" },
        { id: OWNER_B, registered_at: "2026-02-01T00:00:00.000Z" },
        { id: OWNER_UNREADABLE, registered_at: "2026-03-01T00:00:00.000Z" },
      ],
    },
    cards: {
      columns: oldCards,
      rows: [
        card({ id: CARD_A, owner_id: OWNER_A, display_name: "Ada Card", public_token: "token-a", photo_attachment_id: PENDING }),
        card({ id: CARD_B, owner_id: OWNER_B, display_name: "Bee Card", public_token: "token-b", photo_attachment_id: B_FILE }),
      ],
    },
    items: { columns: ITEM_COLUMNS, rows: [...itemsA, ...itemsB] },
    external_contacts: {
      columns: oldContacts,
      rows: [
        contact({
          id: "contact-a",
          owner_id: OWNER_A,
          display_name: "Ada",
          photo_attachment_id: READY,
          files: [
            { id: READY, name: "Mine.pdf" },
            { id: FOREIGN, name: "Secret.pdf" },
            { id: PENDING, name: "Waiting.pdf" },
          ],
        }),
        contact({ id: "contact-b", owner_id: OWNER_B, display_name: "Bee", photo_attachment_id: B_FILE }),
      ],
    },
    attachments: {
      columns: FILE_COLUMNS,
      rows: [
        file({ id: READY, owner_id: OWNER_A, storage_path: `${OWNER_A}/contact/${READY}`, original_name: "Mine.pdf", byte_size: 4 }),
        file({ id: BIG, owner_id: OWNER_A, storage_path: `${OWNER_A}/library/${BIG}`, original_name: "Library.bin", mime: "application/octet-stream", byte_size: BIG_BYTES }),
        file({ id: PENDING, owner_id: OWNER_A, storage_path: `${OWNER_A}/library/${PENDING}`, original_name: "Waiting.pdf", status: "pending" }),
        file({ id: FOREIGN, owner_id: OWNER_A, storage_path: `${OWNER_B}/secret/${FOREIGN}`, original_name: "Secret.pdf" }),
        file({ id: B_FILE, owner_id: OWNER_B, storage_path: `${OWNER_B}/library/${B_FILE}`, original_name: "Bee.pdf" }),
        file({ id: UNREADABLE, owner_id: OWNER_UNREADABLE, storage_path: `${OWNER_UNREADABLE}/library/${UNREADABLE}`, original_name: "Gone.pdf" }),
      ],
    },
    card_items: {
      columns: ["card_id", "item_id", "sort_order"],
      rows: [...linksFor(CARD_A, itemsA), ...linksFor(CARD_B, itemsB)],
    },
    consents: {
      columns: ["user_id", "document_version", "accepted_at"],
      rows: [
        { user_id: OWNER_A, document_version: "1.2", accepted_at: "2026-01-03T00:00:00.000Z" },
        { user_id: OWNER_B, document_version: "1.2", accepted_at: "2026-02-03T00:00:00.000Z" },
      ],
    },
  };
}

function brokenTables(): Record<string, Table> {
  return {
    profiles: { columns: ["id", "registered_at"], rows: [{ id: OWNER_BROKEN, registered_at: "2026-01-01T00:00:00.000Z" }] },
    cards: {
      columns: without(CARD_COLUMNS, ["photo_attachment_id"]),
      rows: [card({ id: "card-broken", owner_id: OWNER_BROKEN, display_name: "Broken" })],
    },
    items: { columns: ITEM_COLUMNS, rows: [] },
    external_contacts: { columns: CONTACT_COLUMNS, rows: [] },
    attachments: { columns: FILE_COLUMNS, rows: [] },
    card_items: { columns: ["card_id", "item_id", "sort_order"], rows: [] },
    consents: { columns: ["user_id", "document_version", "accepted_at"], rows: [] },
  };
}

function createFake(tables: Record<string, Table>, selects: string[], ranges: string[], errors: string[]): ExportDatabase {
  return {
    from(table: string) {
      return {
        select(columns: string) {
          selects.push(`${table}: ${columns}`);
          const requested = columns.split(",").map((part) => part.trim()).filter(Boolean);
          const spec = tables[table];
          const missing = spec ? requested.find((column) => !spec.columns.includes(column)) : null;
          const message = !spec
            ? `relation "${table}" does not exist`
            : missing
              ? `column ${table}.${missing} does not exist`
              : null;
          if (message && missing) errors.push(message);
          const filters: ((row: Row) => boolean)[] = [];
          const orders: string[] = [];
          let limit: number | null = null;
          const api = {
            eq(column: string, value: string) {
              filters.push((row) => row[column] === value);
              return api;
            },
            in(column: string, values: readonly string[]) {
              const allowed = new Set(values);
              filters.push((row) => allowed.has(String(row[column])));
              return api;
            },
            order(column: string) {
              orders.push(column);
              return api;
            },
            limit(count: number) {
              limit = count;
              return api;
            },
            range(from: number, to: number) {
              ranges.push(`${table}: ${from}-${to}`);
              if (message) return Promise.resolve({ data: null, error: { message } });
              return Promise.resolve({ data: projected().slice(from, to + 1), error: null });
            },
            maybeSingle() {
              if (message) return Promise.resolve({ data: null, error: { message } });
              return Promise.resolve({ data: projected()[0] ?? null, error: null });
            },
          };
          return api;

          function projected() {
            let rows = spec.rows.filter((row) => filters.every((keep) => keep(row)));
            if (orders.length) {
              rows = [...rows].sort((left, right) => {
                for (const column of orders) {
                  const compared = String(left[column] ?? "").localeCompare(String(right[column] ?? ""));
                  if (compared) return compared;
                }
                return 0;
              });
            }
            if (limit !== null) rows = rows.slice(0, limit);
            return rows.map((row) => {
              const copy: Row = {};
              for (const column of requested) copy[column] = row[column];
              return copy;
            });
          }
        },
      };
    },
  };
}

function fields(select: string) {
  return select.split(": ")[1]?.split(", ") ?? [];
}

function concat(chunks: Uint8Array[]) {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  let cursor = 0;
  for (const chunk of chunks) {
    out.set(chunk, cursor);
    cursor += chunk.length;
  }
  return out;
}

function zipEntries(zip: Uint8Array) {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const entries: { name: string; data: Uint8Array }[] = [];
  let offset = 0;
  while (offset + 30 <= zip.length && view.getUint32(offset, true) === 0x04034b50) {
    const size = view.getUint32(offset + 18, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extra = view.getUint16(offset + 28, true);
    const nameStart = offset + 30;
    const name = new TextDecoder().decode(zip.subarray(nameStart, nameStart + nameLength));
    const dataStart = nameStart + nameLength + extra;
    entries.push({ name, data: zip.subarray(dataStart, dataStart + size) });
    offset = dataStart + size;
  }
  return entries;
}

test("two accounts download by HTTP without a short page, a dropped id, or a file the zip does not contain", async () => {
  const selects: string[] = [];
  const ranges: string[] = [];
  const errors: string[] = [];
  const brokenSelects: string[] = [];
  const brokenErrors: string[] = [];
  const live = createFake(liveTables(), selects, ranges, errors);
  const broken = createFake(brokenTables(), brokenSelects, [], brokenErrors);
  const users = new Map([
    [OWNER_A, { id: OWNER_A, email: "a-owner@example.com", identities: [{ provider: "email" }] }],
    [OWNER_B, { id: OWNER_B, email: "b-owner@example.com", identities: [{ provider: "email" }] }],
    [OWNER_BROKEN, { id: OWNER_BROKEN, email: "broken-owner@example.com", identities: [{ provider: "email" }] }],
    [OWNER_UNREADABLE, { id: OWNER_UNREADABLE, email: "missing-file@example.com", identities: [{ provider: "email" }] }],
  ]);
  const big = new Uint8Array(BIG_BYTES);
  big[0] = 0xab;
  big[big.length - 1] = 0xcd;
  const small = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
  let releaseBig = () => {};
  const bigGate = new Promise<void>((resolve) => {
    releaseBig = resolve;
  });
  let written = 0;

  const download = async (row: ExportAttachment) => {
    if (row.id === BIG) {
      await bigGate;
      return big;
    }
    if (row.id === UNREADABLE) return null;
    if (row.id === READY || row.id === B_FILE) return small;
    return null;
  };
  const databaseFor = (ownerId: string) => (ownerId === OWNER_BROKEN ? broken : live);

  const server = createServer(async (request: IncomingMessage, response: ServerResponse) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const owner = url.searchParams.get("owner");
    const exported = await streamAccountExport(
      owner ? { ok: true, id: owner } : { ok: false, status: 401 },
      (ownerId) =>
        runAccountExport({
          ownerId,
          user: users.get(ownerId) ?? null,
          database: databaseFor(ownerId),
          download,
        }),
    );
    response.writeHead(exported.status, Object.fromEntries(exported.headers));
    if (!exported.body) {
      response.end();
      return;
    }
    const reader = exported.body.getReader();
    try {
      for (;;) {
        const step = await reader.read();
        if (step.done) break;
        written += step.value.byteLength;
        response.write(Buffer.from(step.value.buffer, step.value.byteOffset, step.value.byteLength));
      }
      response.end();
    } catch {
      response.end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("no port");
  const origin = `http://127.0.0.1:${address.port}`;

  try {
    const early = await fetch(`${origin}/api/account/export?owner=${OWNER_A}`);
    assert.equal(early.status, 200);
    assert.equal(early.headers.get("content-type"), "application/zip");
    assert.match(early.headers.get("content-disposition") ?? "", /attachment; filename="aded-account\.zip"/);
    assert.match(early.headers.get("cache-control") ?? "", /private/);
    const reader = early.body?.getReader();
    if (!reader) throw new Error("no body");
    const first = await reader.read();
    assert.equal(first.done, false);
    assert.equal(first.value?.[0], 0x50);
    assert.equal(first.value?.[1], 0x4b);
    assert.ok(written > 0);
    assert.ok(written < 200_000);
    const chunks = [first.value];
    releaseBig();
    for (;;) {
      const step = await reader.read();
      if (step.done) break;
      chunks.push(step.value);
    }
    const zip = concat(chunks);
    assert.ok(zip.byteLength > BIG_BYTES);
    const ada = readAccount(zip);
    assert.equal(ada.document.account.email, "a-owner@example.com");
    assert.equal(ada.document.account.id, OWNER_A);
    assert.equal(ada.document.library.length, EXPORT_PAGE_SIZE + 1);
    assert.equal(ada.document.portfolioItems.length, EXPORT_PAGE_SIZE + 1);
    assert.equal(ada.document.portfolios[0]?.id, CARD_A);
    assert.equal(ada.document.portfolios[0]?.photoAttachmentId, null);
    assert.equal(ada.document.manualContacts[0]?.id, "contact-a");
    assert.deepEqual(ada.document.manualContacts[0]?.files, [{ id: READY, name: "Mine.pdf", included: true }]);
    assert.equal(ada.document.manualContacts[0]?.photoAttachmentId, READY);
    const packedPaths = ada.document.files.map((entry) => entry.path).sort();
    assert.deepEqual(packedPaths, ada.paths.filter((name) => name !== "README.txt" && name !== "account.json").sort());
    assert.deepEqual(
      packedPaths,
      [`contacts/${READY}/Mine.pdf`, `files/${BIG}/Library.bin`].sort(),
    );
    const packedBig = ada.entries.find((entry) => entry.name === `files/${BIG}/Library.bin`);
    assert.equal(packedBig?.data.byteLength, BIG_BYTES);
    assert.equal(packedBig?.data[0], 0xab);
    assert.equal(packedBig?.data[BIG_BYTES - 1], 0xcd);
    assert.equal(ada.raw.includes("Secret.pdf"), false);
    assert.equal(ada.raw.includes("Waiting.pdf"), false);
    assert.equal(ada.raw.includes(FOREIGN), false);
    assert.equal(ada.raw.includes(PENDING), false);
    assert.equal(ada.raw.includes("b-owner@example.com"), false);
    assert.equal(ada.raw.includes(CARD_B), false);
    assert.ok(ranges.some((range) => range === `items: 0-${EXPORT_PAGE_SIZE - 1}`));
    assert.ok(ranges.some((range) => range === `items: ${EXPORT_PAGE_SIZE}-${EXPORT_PAGE_SIZE * 2 - 1}`));
    assert.ok(ranges.some((range) => range === `card_items: 0-${EXPORT_PAGE_SIZE - 1}`));
    const contactSelects = selects.filter((line) => line.startsWith("external_contacts:"));
    assert.ok(fields(contactSelects[0] ?? "").includes("pushback_card_id"));
    assert.ok(fields(contactSelects.at(-1) ?? "").includes("id"));
    assert.equal(fields(contactSelects.at(-1) ?? "").includes("pushback_card_id"), false);
    assert.ok(fields(contactSelects.at(-1) ?? "").includes("photo_attachment_id"));
    assert.ok(errors.includes("column external_contacts.header_field does not exist"));

    const beeZip = await readResponse(await fetch(`${origin}/api/account/export?owner=${OWNER_B}`));
    const bee = readAccount(beeZip);
    assert.equal(bee.document.account.email, "b-owner@example.com");
    assert.equal(bee.document.library.length, 1);
    assert.equal(bee.document.portfolios[0]?.id, CARD_B);
    assert.equal(bee.raw.includes("a-owner@example.com"), false);
    assert.equal(bee.raw.includes(CARD_A), false);
    assert.equal(bee.raw.includes(READY), false);
    assert.deepEqual(
      bee.document.files.map((entry) => entry.path),
      [`contacts/${B_FILE}/Bee.pdf`],
    );

    const unsigned = await fetch(`${origin}/api/account/export`);
    assert.equal(unsigned.status, 401);
    assert.match(unsigned.headers.get("content-type") ?? "", /json/);
    assert.equal((await unsigned.json()).error, "Sign in to download your data.");

    const oldSchema = await fetch(`${origin}/api/account/export?owner=${OWNER_BROKEN}`);
    assert.equal(oldSchema.status, 500);
    assert.match(oldSchema.headers.get("content-type") ?? "", /json/);
    const brokenCards = brokenSelects.filter((line) => line.startsWith("cards:"));
    assert.equal(brokenCards.length, 1);
    assert.ok(fields(brokenCards[0] ?? "").includes("id"));
    assert.ok(fields(brokenCards[0] ?? "").includes("photo_attachment_id"));
    assert.ok(brokenErrors.includes("column cards.photo_attachment_id does not exist"));

    const unread = await readResponse(await fetch(`${origin}/api/account/export?owner=${OWNER_UNREADABLE}`));
    assert.deepEqual(zipEntries(unread).map((entry) => entry.name), ["README.txt"]);
  } finally {
    releaseBig();
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

async function readResponse(response: Response) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("no body");
  const chunks: Uint8Array[] = [];
  for (;;) {
    const step = await reader.read();
    if (step.done) break;
    chunks.push(step.value);
  }
  return concat(chunks);
}

type AccountFile = { id: string; name: string; path: string };
type AccountDocument = {
  account: { id: string; email: string | null };
  files: AccountFile[];
  portfolios: { id: string; photoAttachmentId: string | null }[];
  library: { id: string; attachmentId: string | null }[];
  portfolioItems: { cardId: string; itemId: string }[];
  manualContacts: { id: string; photoAttachmentId: string | null; files: { id: string; name: string; included: boolean }[] }[];
};

function readAccount(zip: Uint8Array) {
  const entries = zipEntries(zip);
  assert.equal(new DataView(zip.buffer, zip.byteOffset, zip.byteLength).getUint32(zip.length - 22, true), 0x06054b50);
  const account = entries.find((entry) => entry.name === "account.json");
  if (!account) throw new Error("account.json missing");
  const raw = new TextDecoder().decode(account.data);
  return { entries, paths: entries.map((entry) => entry.name), raw, document: JSON.parse(raw) as AccountDocument };
}

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  bumpProductCount,
  contactCountAction,
  openCountAction,
  productCountCutoff,
  registrationCountAction,
  registrationMethod,
  scopedProductCount,
  type CountClient,
  type CountError,
  type CountQuery,
  type ProductCountRow,
} from "./product-stats.ts";

const CARD = "11111111-1111-4111-8111-111111111111";
const OWNER = "22222222-2222-4222-8222-222222222222";
const OTHER = "33333333-3333-4333-8333-333333333333";

function memory() {
  const rows: ProductCountRow[] = [];
  function builder(mode: "read" | "update", patch?: { total: number }): CountQuery {
    const filters: Record<string, string | null> = {};
    const query: CountQuery = {
      eq(column, value) {
        filters[column] = value;
        return query;
      },
      is(column, value) {
        filters[column] = value;
        return query;
      },
      select() {
        return query;
      },
      async maybeSingle() {
        const index = rows.findIndex((row) => {
          if (filters.day !== undefined && row.day !== filters.day) return false;
          if (filters.action !== undefined && row.action !== filters.action) return false;
          if (filters.card_id !== undefined && row.card_id !== filters.card_id) return false;
          if (filters.total !== undefined && String(row.total) !== filters.total) return false;
          return true;
        });
        if (index === -1) return { data: null, error: null };
        if (mode === "update" && patch) rows[index] = { ...rows[index], total: patch.total };
        return { data: { total: rows[index].total }, error: null };
      },
    };
    return query;
  }
  const client: CountClient = {
    from() {
      return {
        select() {
          return builder("read");
        },
        async insert(row) {
          const clash = rows.some(
            (item) => item.day === row.day && item.action === row.action && item.card_id === row.card_id,
          );
          if (clash) return { error: { code: "23505", message: "duplicate" } };
          rows.push({ ...row });
          const keys = Object.keys(row);
          assert.deepEqual(keys, ["day", "action", "card_id", "owner_id", "total"]);
          return { error: null };
        },
        update(patch) {
          return builder("update", patch);
        },
      };
    },
  };
  return { client, rows };
}

function missingClient(message: string): CountClient {
  const error: CountError = { message };
  const query: CountQuery = {
    eq() {
      return query;
    },
    is() {
      return query;
    },
    select() {
      return query;
    },
    async maybeSingle() {
      return { data: null, error };
    },
  };
  return {
    from() {
      return {
        select() {
          return query;
        },
        async insert() {
          return { error };
        },
        update() {
          return query;
        },
      };
    },
  };
}

test("a completed registration counts once, and a later sign-in does not", () => {
  assert.equal(registrationCountAction(null, "email"), "registration_email");
  assert.equal(registrationCountAction(null, "google"), "registration_google");
  assert.equal(registrationCountAction(null, "apple"), "registration_apple");
  assert.equal(registrationCountAction("2026-11-24T00:00:00.000Z", "google"), null);
  assert.equal(registrationCountAction(null, null), null);
  assert.equal(registrationMethod("google", []), "google");
  assert.equal(registrationMethod("apple", ["apple"]), "apple");
  assert.equal(registrationMethod(null, ["email"]), "email");
  assert.equal(registrationMethod(null, ["google", "email"]), null);
});

test("a new contact counts by source, and an edit is not a new save", () => {
  assert.equal(contactCountAction("manual"), "contact_manual");
  assert.equal(contactCountAction("scan"), "contact_scan");
  assert.equal(contactCountAction("voice"), "contact_voice");
  assert.equal(contactCountAction("photo"), "contact_photo");
  assert.equal(contactCountAction("draft"), null);
  const store = readFileSync(new URL("../../features/contact-collect/store.ts", import.meta.url), "utf8");
  const createAt = store.indexOf("export async function createExternalContact");
  const updateAt = store.indexOf("export async function updateExternalContact");
  const afterUpdate = store.indexOf("export async function readOwnedPortfolio");
  assert.match(store.slice(createAt, updateAt), /contactCountAction\(saved\.source\)/);
  assert.doesNotMatch(store.slice(updateAt, afterUpdate), /noteProductCount/);
});

test("share link and opens keep the card, and other totals do not", async () => {
  const { client, rows } = memory();
  assert.equal(await bumpProductCount(client, { day: "2026-11-24", action: "registration_email", cardId: CARD, ownerId: OWNER }), "added");
  assert.equal(rows[0].card_id, null);
  assert.equal(rows[0].owner_id, null);
  assert.equal(rows[0].total, 1);

  assert.equal(await bumpProductCount(client, { day: "2026-11-24", action: "share_link", cardId: CARD, ownerId: OWNER }), "added");
  assert.equal(await bumpProductCount(client, { day: "2026-11-24", action: "share_link", cardId: CARD, ownerId: OWNER }), "added");
  const share = rows.find((row) => row.action === "share_link" && row.card_id === CARD);
  assert.equal(share?.total, 2);
  assert.equal(share?.owner_id, OWNER);

  assert.equal(await bumpProductCount(client, { day: "2026-11-24", action: "open_qr", cardId: OTHER, ownerId: OWNER }), "added");
  assert.equal(await bumpProductCount(client, { day: "2026-11-24", action: "open_other", cardId: OTHER, ownerId: OWNER }), "added");
  assert.equal(rows.filter((row) => row.card_id === OTHER).length, 2);
  assert.equal(openCountAction("qr_open"), "open_qr");
  assert.equal(openCountAction("card_open"), "open_other");
  assert.equal(scopedProductCount("share_link", "not-a-card", OWNER), null);
  assert.equal(await bumpProductCount(client, { day: "2026-11-24", action: "open_qr" }), "ignored");
});

test("daily totals older than 90 days are the ones the purge removes", () => {
  assert.equal(productCountCutoff("2026-11-24"), "2026-08-26");
  const cutoff = productCountCutoff("2026-11-24");
  const kept = "2026-08-26" < cutoff;
  const dropped = "2026-08-25" < cutoff;
  assert.equal(kept, false);
  assert.equal(dropped, true);
});

test("a missing statistics table does not become an error", async () => {
  const client = missingClient("Could not find the table 'public.product_daily_counts' in the schema cache");
  assert.equal(await bumpProductCount(client, { day: "2026-11-24", action: "card_saved" }), "missing");
});

test("the statistics table is not readable by an account or a public page", () => {
  const sql = readFileSync(new URL("../../../docs/phaseN-product-counts.sql", import.meta.url), "utf8");
  assert.match(sql, /revoke all on table public\.product_daily_counts from public, anon, authenticated/);
  assert.doesNotMatch(sql, /grant select(?:, [^;]+)? on table public\.product_daily_counts to authenticated/);
  const share = readFileSync(new URL("../../app/api/network/share/route.ts", import.meta.url), "utf8");
  const accept = readFileSync(new URL("../../app/api/connections/accept/route.ts", import.meta.url), "utf8");
  assert.doesNotMatch(share, /\.from\("product_daily_counts"\)/);
  assert.doesNotMatch(accept, /\.from\("product_daily_counts"\)/);
  const shareControl = readFileSync(new URL("../components/card-share-control.tsx", import.meta.url), "utf8");
  assert.match(shareControl, /fetch\("\/api\/network\/share"/);
  assert.doesNotMatch(shareControl, /shareCardChoice\(\{ title, url \}\)\.then/);
  const qr = readFileSync(new URL("../../../главный-экран/components/qr-zone.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(qr, /\/api\/network\/share/);
  assert.match(qr, /src=qr/);
});

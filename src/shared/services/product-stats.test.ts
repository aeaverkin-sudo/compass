import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  contactCountAction,
  openCountAction,
  productCountBumpArgs,
  productCountCutoff,
  registrationCountAction,
  registrationMethod,
} from "./product-stats.ts";

const CARD = "11111111-1111-4111-8111-111111111111";
const OWNER = "22222222-2222-4222-8222-222222222222";

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

test("a card total keeps the card, and every other total drops it", () => {
  const share = productCountBumpArgs({ action: "share_link", cardId: CARD, ownerId: OWNER, now: new Date("2026-11-24T12:00:00.000Z") });
  assert.deepEqual(share, {
    p_day: "2026-11-24",
    p_action: "share_link",
    p_card_id: CARD,
    p_owner_id: OWNER,
  });
  const registration = productCountBumpArgs({
    action: "registration_email",
    cardId: CARD,
    ownerId: OWNER,
    now: new Date("2026-11-24T12:00:00.000Z"),
  });
  assert.equal(registration?.p_card_id, null);
  assert.equal(registration?.p_owner_id, null);
  assert.equal(productCountBumpArgs({ action: "open_qr" }), null);
  assert.equal(openCountAction("qr_open"), "open_qr");
  assert.equal(openCountAction("card_open"), "open_other");
});

test("daily totals older than 90 days are the ones the purge removes", () => {
  const cutoff = productCountCutoff("2026-11-24");
  assert.equal(cutoff, "2026-08-26");
  assert.equal("2026-08-26" < cutoff, false);
  assert.equal("2026-08-25" < cutoff, true);
});

test("the write asks Postgres to increment once and to honour an objection", () => {
  const record = readFileSync(new URL("./product-stats-record.ts", import.meta.url), "utf8");
  const sql = readFileSync(new URL("../../../docs/phaseN-product-counts.sql", import.meta.url), "utf8");
  assert.match(record, /rpc\("bump_product_count"/);
  assert.match(record, /rpc\("object_to_product_counts"/);
  assert.doesNotMatch(record, /for \(let attempt/);
  assert.match(sql, /product_count_objections/);
  assert.match(sql, /on conflict on constraint product_daily_counts_key/);
  assert.match(sql, /do update set total = counted\.total \+ 1/);
  const bump = sql.slice(sql.indexOf("function public.bump_product_count"), sql.indexOf("function public.object_to_product_counts"));
  assert.ok(bump.indexOf("product_count_objections") < bump.indexOf("insert into public.product_daily_counts"));
  assert.match(sql, /revoke all on table public\.product_daily_counts from public, anon, authenticated/);
  assert.match(sql, /revoke all on table public\.product_count_objections from public, anon, authenticated/);
  assert.match(sql, /revoke all on function public\.bump_product_count\(date, text, uuid, uuid\) from public, anon, authenticated/);
  const notice = readFileSync(new URL("../components/consent-refresh.tsx", import.meta.url), "utf8");
  assert.match(notice, /Daily totals are not required to sign in/);
  assert.match(notice, /I agree to the updated/);
  assert.doesNotMatch(notice, /agree to (the )?(daily|product|statistics|stats)/i);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  PRODUCT_COUNTS_ENABLED,
  contactCountAction,
  openCountAction,
  productCountBumpArgs,
  productCountCutoff,
  objectionConfirm,
  objectionGet,
  objectionRead,
  objectedFromQuery,
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
  assert.equal(PRODUCT_COUNTS_ENABLED, false);
  assert.ok(record.indexOf("if (!PRODUCT_COUNTS_ENABLED) return") < record.indexOf('rpc("bump_product_count"'));
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
  assert.match(notice, /We&apos;ve updated our Terms and Privacy Policy\./);
  assert.match(notice, /I agree to the updated/);
  assert.doesNotMatch(notice, /Daily totals are not required to sign in/);
  assert.doesNotMatch(notice, /agree to (the )?(daily|product|statistics|stats)/i);
  const privacy = readFileSync(new URL("../../../legal/privacy-policy.md", import.meta.url), "utf8");
  const legal = readFileSync(new URL("../../app/legal/legal-screen.tsx", import.meta.url), "utf8");
  const guest = objectionGet({ signedIn: false });
  assert.deepEqual(guest, { status: 200, body: { signedIn: false } });
  assert.equal(objectionRead(guest.status === 200, guest.body), "guest");
  assert.equal(objectionConfirm("guest"), false);
  const failed = objectionGet({ signedIn: true, failed: true });
  assert.equal(failed.status, 503);
  assert.equal(objectionRead(false, failed.body), "unknown");
  assert.equal(objectionConfirm("unknown"), false);
  const saved = objectionGet({ signedIn: true, objected: true });
  assert.deepEqual(saved, { status: 200, body: { objected: true } });
  assert.equal(objectionRead(true, saved.body), "on");
  assert.equal(objectionConfirm("on"), false);
  const open = objectionGet({ signedIn: true, objected: false });
  assert.deepEqual(open, { status: 200, body: { objected: false } });
  assert.equal(objectionRead(true, open.body), "off");
  assert.equal(objectionConfirm("off"), true);
  assert.equal(objectionConfirm("loading"), false);
  const missing = { error: { message: "Could not find the table 'public.product_count_objections' in the schema cache" }, data: null };
  assert.throws(() => objectedFromQuery(missing));
  assert.equal(objectedFromQuery({ error: null, data: null }), false);
  let readFailure;
  try {
    readFailure = objectionGet({ signedIn: true, objected: objectedFromQuery(missing) });
  } catch {
    readFailure = objectionGet({ signedIn: true, failed: true });
  }
  assert.equal(readFailure.status, 503);
  assert.equal(objectionRead(false, readFailure.body), "unknown");
  assert.equal(objectionConfirm(objectionRead(false, readFailure.body)), false);
  const reader = record.slice(record.indexOf("function productCountsObjected"), record.indexOf("function objectToProductCounts"));
  assert.match(reader, /return objectedFromQuery\(row\)/);
  assert.doesNotMatch(reader, /return false/);
  const route = readFileSync(new URL("../../app/api/account/product-count-objection/route.ts", import.meta.url), "utf8");
  assert.match(route, /objectionGet\(\{ signedIn: true, failed: true \}\)/);
  assert.match(privacy, /Collection of daily totals is off\./);
  assert.match(privacy, /^Effective 25 November 2026 · Version 1\.6$/m);
  assert.equal(privacy.split("You can also object to statistics linked to your account.").length - 1, 1);
  const section4 = privacy.slice(privacy.indexOf("## 4. Saved contacts"), privacy.indexOf("## 5."));
  assert.match(section4, /legitimate interest/);
  assert.doesNotMatch(section4, /sends the notice/);
  assert.doesNotMatch(section4, /The email says/);
  const terms = readFileSync(new URL("../../../legal/terms-and-conditions.md", import.meta.url), "utf8");
  assert.match(terms, /^Effective 25 November 2026 · Version 1\.6$/m);
  assert.match(legal, /phrase=\{phrase \? ASK_SENTENCE : undefined\}/);
  assert.doesNotMatch(legal, /Consent v/);
  assert.doesNotMatch(legal, /Download data in Account/);
  assert.match(legal, /Statistics linked to your account are off\./);
  assert.match(legal, /We could not read whether statistics linked to your account are off\./);
  assert.match(legal, /objectionConfirm\(read\)/);
  assert.equal(PRODUCT_COUNTS_ENABLED, false);
  assert.doesNotMatch(privacy, /Version 1\.5/);
  assert.doesNotMatch(legal, /setObjected\(false\)/);
  assert.doesNotMatch(legal, /Object to totals linked to your account/);
  assert.equal(privacy.includes("Turn off account-linked statistics?"), false);
});

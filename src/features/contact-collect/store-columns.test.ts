import assert from "node:assert/strict";
import test from "node:test";
import {
  clockAfterAttempt,
  clockAfterSuccess,
  columnAttempts,
  missingTable,
  planColumns,
  readColumnLadder,
  type ColumnSet,
  type SchemaClock,
} from "./store-columns.ts";

test("a missing header or More column is not a missing contacts table", () => {
  assert.equal(
    missingTable({ message: 'column external_contacts.header_field does not exist' }),
    false,
  );
  assert.equal(
    missingTable({
      message: "Could not find the 'web' column of 'external_contacts' in the schema cache",
    }),
    false,
  );
  assert.equal(missingTable({ code: "42P01", message: 'relation "external_contacts" does not exist' }), true);
  assert.equal(
    missingTable({
      code: "PGRST205",
      message: "Could not find the table 'public.external_contacts' in the schema cache",
    }),
    true,
  );
  assert.equal(
    missingTable({ code: "42703", message: "column external_contacts.position does not exist" }),
    false,
  );
  assert.equal(
    missingTable({
      code: "42703",
      message: 'column "position" of relation "external_contacts" does not exist',
    }),
    false,
  );
  assert.equal(missingTable({ message: "Could not read contacts." }), false);
});

test("a known column set is reused until the next fresh look", () => {
  assert.deepEqual(columnAttempts("base", false), ["base"]);
  assert.deepEqual(columnAttempts("header", false), ["header", "base"]);
  assert.deepEqual(columnAttempts("base", true), ["more", "moreBase", "header", "base"]);
  assert.deepEqual(columnAttempts("moreBase", false), ["moreBase"]);
});

test("constant base reads do not postpone seeing More after the migration", () => {
  const hold = 5 * 60 * 1000;
  let clock: SchemaClock = { known: "more", fullCheckAt: 0 };
  let plan = planColumns(clock, 0, hold);
  assert.deepEqual(plan, ["more", "moreBase", "header", "base"]);
  clock = clockAfterSuccess(clockAfterAttempt(clock, plan, 0), "base");
  assert.equal(clock.fullCheckAt, 0);
  assert.equal(clock.known, "base");

  for (let minute = 1; minute <= 4; minute += 1) {
    const now = minute * 60 * 1000;
    plan = planColumns(clock, now, hold);
    assert.deepEqual(plan, ["base"]);
    clock = clockAfterSuccess(clockAfterAttempt(clock, plan, now), "base");
    assert.equal(clock.fullCheckAt, 0);
  }

  plan = planColumns(clock, hold, hold);
  assert.deepEqual(plan, ["more", "moreBase", "header", "base"]);
  clock = clockAfterSuccess(clockAfterAttempt(clock, plan, hold), "more");
  assert.equal(clock.known, "more");
  assert.equal(clock.fullCheckAt, hold);
  assert.deepEqual(planColumns(clock, hold + 1000, hold)[0], "more");
});

const HOLD = 5 * 60 * 1000;
const HEADER_GONE = { message: "column header_field of relation external_contacts does not exist" };
const ABOUT_GONE = {
  message: "Could not find the 'about' column of 'external_contacts' in the schema cache",
};

test("a full schema read returns About and the next read stays wide", async () => {
  const row = { display_name: "Jordan", note: "", about: "Met over lunch" };
  const seen: ColumnSet[] = [];
  const opened = await readColumnLadder({ known: "more", fullCheckAt: 0 }, 0, HOLD, async (set) => {
    seen.push(set);
    return set === "more" ? { error: null, data: row } : { error: HEADER_GONE, data: null };
  });
  assert.deepEqual(seen, ["more"]);
  assert.equal(opened.result.data?.about, "Met over lunch");
  assert.equal(opened.clock.known, "more");
  assert.equal(planColumns(opened.clock, 1000, HOLD)[0], "more");
});

test("More without header_field still returns About, then rechecks the wide select", async () => {
  const row = { display_name: "Jordan", note: "", about: "Met over lunch" };
  const seen: ColumnSet[] = [];
  const opened = await readColumnLadder({ known: "more", fullCheckAt: 0 }, 0, HOLD, async (set) => {
    seen.push(set);
    if (set === "moreBase") return { error: null, data: row };
    return { error: HEADER_GONE, data: null };
  });
  assert.deepEqual(seen, ["more", "moreBase"]);
  assert.equal(opened.result.data?.about, "Met over lunch");
  assert.equal(opened.clock.known, "moreBase");
  assert.equal(opened.clock.fullCheckAt, 0);

  const again: ColumnSet[] = [];
  const held = await readColumnLadder(opened.clock, 60 * 1000, HOLD, async (set) => {
    again.push(set);
    return { error: null, data: row };
  });
  assert.deepEqual(again, ["moreBase"]);
  assert.equal(held.result.data?.about, "Met over lunch");
  assert.equal(held.clock.fullCheckAt, 0);

  const fresh = planColumns(held.clock, HOLD, HOLD);
  assert.deepEqual(fresh, ["more", "moreBase", "header", "base"]);
});

test("a base schema falls through More and still reads without About", async () => {
  const seen: ColumnSet[] = [];
  const opened = await readColumnLadder({ known: "more", fullCheckAt: 0 }, 0, HOLD, async (set) => {
    seen.push(set);
    if (set === "more" || set === "moreBase") return { error: ABOUT_GONE, data: null };
    if (set === "header") return { error: HEADER_GONE, data: null };
    return { error: null, data: { display_name: "Jordan", note: "", about: undefined } };
  });
  assert.deepEqual(seen, ["more", "moreBase", "header", "base"]);
  assert.equal(opened.result.data?.about, undefined);
  assert.equal(opened.clock.known, "base");
});

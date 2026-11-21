import assert from "node:assert/strict";
import test from "node:test";
import {
  clockAfterAttempt,
  clockAfterSuccess,
  columnAttempts,
  missingTable,
  planColumns,
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
  assert.deepEqual(columnAttempts("base", true), ["more", "header", "base"]);
});

test("constant base reads do not postpone seeing More after the migration", () => {
  const hold = 5 * 60 * 1000;
  let clock: SchemaClock = { known: "more", fullCheckAt: 0 };
  let plan = planColumns(clock, 0, hold);
  assert.deepEqual(plan, ["more", "header", "base"]);
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
  assert.deepEqual(plan, ["more", "header", "base"]);
  clock = clockAfterSuccess(clockAfterAttempt(clock, plan, hold), "more");
  assert.equal(clock.known, "more");
  assert.equal(clock.fullCheckAt, hold);
  assert.deepEqual(planColumns(clock, hold + 1000, hold)[0], "more");
});

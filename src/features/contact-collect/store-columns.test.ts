import assert from "node:assert/strict";
import test from "node:test";
import { columnAttempts, missingTable } from "./store-columns.ts";

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
  assert.equal(missingTable({ message: "Could not read contacts." }), false);
});

test("a known column set is reused until the next fresh look", () => {
  assert.deepEqual(columnAttempts("base", false), ["base"]);
  assert.deepEqual(columnAttempts("header", false), ["header", "base"]);
  assert.deepEqual(columnAttempts("base", true), ["more", "header", "base"]);
});

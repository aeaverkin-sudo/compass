import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { foldSearch } from "../../shared/lib/search-fold.ts";
import { readColumnLadder } from "./store-columns.ts";

const source = readFileSync(new URL("./store.ts", import.meta.url), "utf8");

function loadWriteRules() {
  const start = source.indexOf("const COLUMNS_BASE");
  const end = source.indexOf("const NOT_READY");
  const chunk = source
    .slice(start, end)
    .replace(/^export /gm, "")
    .replace(/row: \{[\s\S]*?\}\):\s*\{[\s\S]*?\}/, "row)")
    .replace(/: boolean/g, "")
    .replace(/\): string/g, ")");
  return new Function(
    "foldSearch",
    `${chunk}\nreturn { insertReturning, updateReturning, savedAboutFields };`,
  )(foldSearch) as {
    insertReturning: (wroteAbout: boolean, withHeader: boolean) => string;
    updateReturning: (widened: boolean, withHeader: boolean) => string;
    savedAboutFields: (row: {
      about?: string | null;
      note?: string | null;
      display_name?: string | null;
    }) => { about: string; searchText: string };
  };
}

const rules = loadWriteRules();

test("an insert that writes About returns it on both column paths", () => {
  const withHeader = rules.insertReturning(true, true);
  const withoutHeader = rules.insertReturning(true, false);
  assert.match(withHeader, /\babout\b/);
  assert.match(withHeader, /\bheader_field\b/);
  assert.match(withoutHeader, /\babout\b/);
  assert.doesNotMatch(withoutHeader, /header_field/);
  assert.match(source, /\.select\(insertReturning\(wroteAbout, true\)\)/);
  assert.match(source, /\.select\(insertReturning\(wroteAbout, false\)\)/);
});

test("an empty About insert keeps the base columns", () => {
  const withHeader = rules.insertReturning(false, true);
  const withoutHeader = rules.insertReturning(false, false);
  assert.doesNotMatch(withHeader, /\babout\b/);
  assert.match(withHeader, /\bheader_field\b/);
  assert.doesNotMatch(withoutHeader, /\babout\b/);
  assert.doesNotMatch(withoutHeader, /header_field/);
});

test("the About update retry does not select header_field", () => {
  const first = rules.updateReturning(true, true);
  const retry = rules.updateReturning(true, false);
  assert.match(first, /\bheader_field\b/);
  assert.match(first, /\babout\b/);
  assert.match(retry, /\babout\b/);
  assert.match(retry, /\bweb\b/);
  assert.match(retry, /\bfiles\b/);
  assert.doesNotMatch(retry, /header_field/);
  assert.match(source, /\.select\(updateReturning\(true, false\)\)/);
  assert.match(source, /\.update\(\{ \.\.\.rowValues\(input, false\), \.\.\.extras \}\)/);
  assert.match(source, /\.eq\("owner_id", ownerId\)/);
});

test("reading More without header_field returns About and Network can find it", async () => {
  assert.match(source, /moreBase: COLUMNS_MORE_BASE/);
  assert.match(source, /\.eq\("owner_id", ownerId\)/);
  const row = { display_name: "Jordan", note: "", about: "Met over lunch" };
  const opened = await readColumnLadder({ known: "more", fullCheckAt: 0 }, 0, 5 * 60 * 1000, async (set) => {
    if (set === "moreBase") return { error: null, data: row };
    if (set === "more") return { error: { message: "column header_field does not exist" }, data: null };
    return { error: { message: "not used" }, data: null };
  });
  const saved = rules.savedAboutFields(opened.result.data ?? {});
  assert.equal(saved.about, "Met over lunch");
  assert.match(saved.searchText, /met over lunch/);
});

test("an empty About save on the base columns does not ask for about", () => {
  assert.doesNotMatch(rules.insertReturning(false, true), /\babout\b/);
  assert.doesNotMatch(rules.insertReturning(false, false), /\babout\b/);
});

test("a returned About is on the contact and in the search text", () => {
  const saved = rules.savedAboutFields({
    display_name: "Jordan",
    note: "door",
    about: "Met over lunch",
  });
  assert.equal(saved.about, "Met over lunch");
  assert.match(saved.searchText, /met over lunch/);
  assert.match(saved.searchText, /jordan/);
  assert.match(source, /savedAbout\.about/);
  assert.match(source, /about: savedAbout\.about/);
});

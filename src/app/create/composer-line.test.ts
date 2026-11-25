import assert from "node:assert/strict";
import test from "node:test";
import { commitComposerLine, toggleLibraryPick, type ComposerLine } from "./composer-line.ts";

test("five enters add five lines and a blank enter adds none", () => {
  let lines: ComposerLine[] = [];
  for (let index = 0; index < 5; index += 1) {
    lines = commitComposerLine(lines, `Line ${index + 1}`, true, `k${index}`);
  }
  assert.equal(lines.length, 5);
  lines = commitComposerLine(lines, "   ", true, "blank");
  assert.equal(lines.length, 5);
});

test("the same text can be entered again, as a separate draft row", () => {
  const once = commitComposerLine([], "Designer", true, "a");
  const twice = commitComposerLine(once, "Designer", true, "b");
  assert.deepEqual(twice.map((line) => line.key), ["a", "b"]);
});

test("an unchecked line is not added to the draft", () => {
  const lines = commitComposerLine([], "Half written", false, "a");
  assert.equal(lines.length, 0);
});

test("a library tick on a half-written line keeps the text and does not finish it", () => {
  const open = "Des";
  const picked = toggleLibraryPick([], "role-1");
  const again = toggleLibraryPick(picked, "phone-1");
  const dropped = toggleLibraryPick(again, "role-1");
  assert.equal(open, "Des");
  assert.deepEqual(again, ["role-1", "phone-1"]);
  assert.deepEqual(dropped, ["phone-1"]);
  assert.equal(commitComposerLine([], open, true, "open")[0]?.value, "Des");
});

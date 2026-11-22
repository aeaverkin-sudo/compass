import assert from "node:assert/strict";
import test from "node:test";
import { ABOUT_EDIT_MAX, joinAbout } from "./about-text.ts";

test("an empty pair and an event tag are not About", () => {
  assert.equal(joinAbout("", ""), "");
  assert.equal(joinAbout("   ", "\n"), "");
});

test("one filled side is the whole About", () => {
  assert.equal(joinAbout("Web Summit", ""), "Web Summit");
  assert.equal(joinAbout("", "met over lunch"), "met over lunch");
});

test("note comes first and a repeated text is shown once", () => {
  assert.equal(joinAbout("Web Summit", "met over lunch"), "Web Summit\n\nmet over lunch");
  assert.equal(joinAbout("  Web Summit  ", "Web Summit"), "Web Summit");
});

test("two full texts fit the edit field with the blank line", () => {
  const note = "n".repeat(500);
  const about = "a".repeat(2000);
  const joined = joinAbout(note, about);
  assert.equal(joined.length, ABOUT_EDIT_MAX);
  assert.equal(joined, `${note}\n\n${about}`);
});

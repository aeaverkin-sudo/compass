import assert from "node:assert/strict";
import test from "node:test";
import { aboutSave, CONTACT_ABOUT_MAX } from "./contact-files.ts";
import { joinAbout } from "./about-text.ts";

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

test("a joined text longer than the column stays whole on screen", () => {
  const note = "n".repeat(500);
  const about = "a".repeat(CONTACT_ABOUT_MAX);
  const joined = joinAbout(note, about);
  assert.equal(joined.length, 2502);
  assert.ok(joined.length > CONTACT_ABOUT_MAX);
});

test("a new About of 2000 is stored in about, and 2001 is refused", () => {
  const accepted = aboutSave({ editing: false, changed: false, text: "a".repeat(2000), storedNote: "" });
  assert.deepEqual(accepted, { ok: true, note: "", about: "a".repeat(2000) });
  const refused = aboutSave({ editing: false, changed: false, text: "a".repeat(2001), storedNote: "" });
  assert.deepEqual(refused, { ok: false, error: "About is too long." });
});

test("an empty new About does not write the column", () => {
  const saved = aboutSave({ editing: false, changed: false, text: "  ", storedNote: "" });
  assert.deepEqual(saved, { ok: true, note: "" });
  assert.equal("about" in saved, false);
});

test("an unchanged edit keeps the old note and does not rewrite a long About", () => {
  const note = "n".repeat(500);
  const about = "a".repeat(2000);
  const saved = aboutSave({
    editing: true,
    changed: false,
    text: joinAbout(note, about),
    storedNote: note,
  });
  assert.deepEqual(saved, { ok: true, note });
  assert.equal("about" in saved, false);
});

test("replacing or clearing About writes about and clears the old note", () => {
  const replaced = aboutSave({ editing: true, changed: true, text: "a".repeat(2000), storedNote: "old note" });
  assert.deepEqual(replaced, { ok: true, note: "", about: "a".repeat(2000) });
  const cleared = aboutSave({ editing: true, changed: true, text: "   ", storedNote: "old note" });
  assert.deepEqual(cleared, { ok: true, note: "", about: "" });
  const tooLong = aboutSave({ editing: true, changed: true, text: "a".repeat(2001), storedNote: "old note" });
  assert.deepEqual(tooLong, { ok: false, error: "About is too long." });
});

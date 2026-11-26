import assert from "node:assert/strict";
import test from "node:test";
import { contactInitials } from "./initials.ts";

test("two words", () => {
  assert.equal(contactInitials("Sergey Petrov"), "SP");
  assert.equal(contactInitials("George Michael"), "GM");
});

test("one word", () => {
  assert.equal(contactInitials("Atelier"), "A");
});

test("three words use the first two", () => {
  assert.equal(contactInitials("Anna Maria Lopez"), "AM");
});

test("extra spaces do not add letters", () => {
  assert.equal(contactInitials("  Sergey   Petrov  "), "SP");
});

test("a digit or a mark before the letter still counts", () => {
  assert.equal(contactInitials("3M"), "3");
  assert.equal(contactInitials("★Atelier"), "A");
});

test("an emoji is skipped until a letter", () => {
  assert.equal(contactInitials("😀Sergey Petrov"), "SP");
  assert.equal(contactInitials("😀 😀"), "");
});

test("an empty name has no letters", () => {
  assert.equal(contactInitials(""), "");
  assert.equal(contactInitials("   "), "");
});

test("cyrillic stays cyrillic", () => {
  assert.equal(contactInitials("Сергей Петров"), "СП");
});

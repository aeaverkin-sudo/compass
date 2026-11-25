import assert from "node:assert/strict";
import test from "node:test";
import { decideComposerLine } from "./composer-line.ts";

const local = [
  { key: "a", value: "SEO", onCard: true },
  { key: "b", value: "Art direction", onCard: false },
];
const library = [{ id: "lib", value: "Founder" }];

test("an empty line adds nothing", () => {
  assert.deepEqual(decideComposerLine("  ", local, library), { kind: "empty" });
});

test("a new line is added", () => {
  assert.deepEqual(decideComposerLine("Investor", local, library), { kind: "add" });
});

test("text already in the library checks that row", () => {
  assert.deepEqual(decideComposerLine("Founder", local, library), { kind: "library", id: "lib" });
});

test("text already typed checks that row", () => {
  assert.deepEqual(decideComposerLine("Art direction", local, library), { kind: "local", key: "b" });
});

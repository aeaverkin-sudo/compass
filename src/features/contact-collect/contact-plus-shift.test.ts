import assert from "node:assert/strict";
import test from "node:test";
import { plusShiftPx } from "./contact-plus-shift.ts";

test("the plus moves by half the difference between the digits and the 23px box", () => {
  assert.equal(plusShiftPx(36), 6.5);
  assert.equal(plusShiftPx(23), 0);
});

test("a missing measurement does not move the plus", () => {
  assert.equal(plusShiftPx(0), 0);
  assert.equal(plusShiftPx(Number.NaN), 0);
});

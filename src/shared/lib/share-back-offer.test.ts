import assert from "node:assert/strict";
import test from "node:test";
import { shareAttempt, shareBackOffer } from "./share-back-offer.ts";

test("an empty book and a card with no name both ask for a portfolio", () => {
  assert.equal(shareBackOffer(0, true, true), "create");
  assert.equal(shareBackOffer(0, true, true), "create");
  assert.equal(shareBackOffer(1, true, true), "send");
  assert.equal(shareBackOffer(0, true, false), "closed");
  assert.equal(shareBackOffer(0, false, true), "closed");
  assert.equal(shareAttempt({ marked: false, linked: false, accepting: true }), "send");
  assert.equal(shareAttempt({ marked: false, linked: false, accepting: false }), "declined");
  assert.equal(shareAttempt({ marked: true, linked: false, accepting: true }), "already");
  assert.equal(shareAttempt({ marked: false, linked: true, accepting: false }), "already");
});

import assert from "node:assert/strict";
import test from "node:test";
import { shareBackOffer } from "./share-back-offer.ts";

test("an empty book and a card with no name both ask for a portfolio", () => {
  assert.equal(shareBackOffer(0, true, true), "create");
  assert.equal(shareBackOffer(0, true, true), "create");
  assert.equal(shareBackOffer(1, true, true), "send");
  assert.equal(shareBackOffer(0, true, false), "closed");
  assert.equal(shareBackOffer(0, false, true), "closed");
});

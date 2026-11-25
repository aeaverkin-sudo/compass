import assert from "node:assert/strict";
import test from "node:test";
import { libraryPlan, libraryZonesBeforeCard } from "./signup-library.ts";

const OWN = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const GONE = "33333333-3333-4333-8333-333333333333";

const position = (
  rows: { key: string; itemId: string | null; onCard: boolean }[],
) => [{ id: "position", rows }];

test("a foreign item is not attached and is not filed", async () => {
  const writing = await libraryZonesBeforeCard(
    position([
      { key: "theirs", itemId: OTHER, onCard: true },
      { key: "mine", itemId: OWN, onCard: true },
    ]),
    async (ids) => {
      assert.deepEqual(ids, [OTHER, OWN]);
      return { data: [{ id: OWN }], error: null };
    },
  );
  const plan = libraryPlan(writing, new Set([OWN]));
  assert.deepEqual(plan.linked, [OWN]);
  assert.deepEqual(plan.itemZones, { [OWN]: "position" });
  assert.equal(writing[0]?.rows.some((row) => row.itemId === OTHER), false);
});

test("a missing item is dropped and the card can still be created", async () => {
  const steps: string[] = [];
  const writing = await libraryZonesBeforeCard(
    position([
      { key: "gone", itemId: GONE, onCard: true },
      { key: "typed", itemId: null, onCard: true },
    ]),
    async () => {
      steps.push("read");
      return { data: [], error: null };
    },
  );
  steps.push("card");
  assert.deepEqual(steps, ["read", "card"]);
  assert.deepEqual(
    writing[0]?.rows.map((row) => row.itemId),
    [null],
  );
  assert.deepEqual(libraryPlan(writing, new Set()).linked, []);
});

test("a failed owner read throws before a card exists", async () => {
  let card = false;
  await assert.rejects(
    libraryZonesBeforeCard(position([{ key: "mine", itemId: OWN, onCard: true }]), async () => ({
      data: null,
      error: { message: "down" },
    })),
    /down/,
  );
  assert.equal(card, false);
});

test("an owned line is filed, and only a checked one is attached", () => {
  const zones = position([
    { key: "off", itemId: OWN, onCard: false },
    { key: "on", itemId: OTHER, onCard: true },
  ]);
  const owned = new Set([OWN, OTHER]);
  const plan = libraryPlan(zones, owned);
  assert.deepEqual(plan.itemZones, { [OWN]: "position", [OTHER]: "position" });
  assert.deepEqual(plan.linked, [OTHER]);
});

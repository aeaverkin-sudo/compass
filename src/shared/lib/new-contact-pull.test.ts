import assert from "node:assert/strict";
import test from "node:test";
import {
  beginContactPull,
  contactPullFires,
  continueContactPull,
  resetContactPull,
  type ContactPullMove,
  type ContactPullStart,
} from "./new-contact-pull.ts";

const EDGE = 24;
const PULL = 24;
const HOLD = 1000;

const start: ContactPullStart = {
  index: 0,
  editing: false,
  arranging: false,
  focused: false,
  guest: false,
  addSlide: false,
  browsing: true,
  edgeX: 100,
  onControl: false,
};

function move(patch: Partial<ContactPullMove> = {}): ContactPullMove {
  return { dx: 30, dy: 0, heldMs: HOLD, index: 0, editing: false, arranging: false, focused: false, ...patch };
}

test("right 30px held for a second fires", () => {
  let pull = beginContactPull(start, EDGE);
  pull = continueContactPull(pull, move({ heldMs: 0 }), PULL, HOLD);
  assert.equal(pull.holding, true);
  assert.equal(contactPullFires(pull), false);
  pull = continueContactPull(pull, move({ heldMs: HOLD }), PULL, HOLD);
  assert.equal(contactPullFires(pull), true);
});

test("right 10px does not fire", () => {
  const pull = continueContactPull(beginContactPull(start, EDGE), move({ dx: 10 }), PULL, HOLD);
  assert.equal(pull.holding, false);
  assert.equal(contactPullFires(pull), false);
});

test("right 30px released at half a second does not fire", () => {
  const pull = continueContactPull(beginContactPull(start, EDGE), move({ heldMs: 500 }), PULL, HOLD);
  assert.equal(contactPullFires(pull), false);
  assert.equal(contactPullFires(resetContactPull()), false);
});

test("a pull to the left does not fire", () => {
  const pull = continueContactPull(beginContactPull(start, EDGE), move({ dx: -30 }), PULL, HOLD);
  assert.equal(contactPullFires(pull), false);
});

test("a vertical move larger than the horizontal one does not fire", () => {
  const pull = continueContactPull(beginContactPull(start, EDGE), move({ dx: 30, dy: 40 }), PULL, HOLD);
  assert.equal(contactPullFires(pull), false);
});

test("a touch 10px from the left edge does not arm", () => {
  const pull = beginContactPull({ ...start, edgeX: 10 }, EDGE);
  assert.equal(pull.armed, false);
  assert.equal(contactPullFires(continueContactPull(pull, move(), PULL, HOLD)), false);
});

test("not the first card does not arm", () => {
  const pull = beginContactPull({ ...start, index: 1 }, EDGE);
  assert.equal(pull.armed, false);
  assert.equal(contactPullFires(continueContactPull(pull, move(), PULL, HOLD)), false);
});

test("edit, arrange, focus, a control, the add slide, a guest, or leaving the card do not fire", () => {
  for (const blocked of [
    { ...start, editing: true },
    { ...start, arranging: true },
    { ...start, focused: true },
    { ...start, onControl: true },
    { ...start, addSlide: true },
    { ...start, guest: true },
    { ...start, browsing: false },
  ]) {
    assert.equal(beginContactPull(blocked, EDGE).armed, false);
  }
  let pull = continueContactPull(beginContactPull(start, EDGE), move({ heldMs: 0 }), PULL, HOLD);
  pull = continueContactPull(pull, move({ index: 1 }), PULL, HOLD);
  assert.equal(contactPullFires(pull), false);
});

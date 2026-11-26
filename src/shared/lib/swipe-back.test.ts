import assert from "node:assert/strict";
import test from "node:test";
import { swipeBackFires, type SwipeBack } from "./swipe-back.ts";

const WIDTH = 400;

function swipe(patch: Partial<SwipeBack> = {}): SwipeBack {
  return {
    startX: 120,
    startY: 200,
    endX: 120,
    endY: 200,
    width: WIDTH,
    onControl: false,
    onHandle: false,
    reordering: false,
    keyboardOpen: false,
    fieldFocused: false,
    ...patch,
  };
}

/** A straight stroke of `distance` px at `degrees` from the horizontal. */
function aimed(degrees: number, distance: number, startX = 120, startY = 200) {
  const rad = (degrees * Math.PI) / 180;
  return {
    startX,
    startY,
    endX: startX + distance * Math.cos(rad),
    endY: startY + distance * Math.sin(rad),
  };
}

test("right 60px at 10 degrees fires", () => {
  assert.equal(swipeBackFires(swipe(aimed(10, 60))), true);
});

test("right 40px does not fire", () => {
  assert.equal(swipeBackFires(swipe(aimed(0, 40))), false);
});

test("45 degrees does not fire", () => {
  assert.equal(swipeBackFires(swipe(aimed(45, 60))), false);
});

test("a pull to the left does not fire", () => {
  assert.equal(swipeBackFires(swipe(aimed(180, 60))), false);
});

test("a start 30px from the left edge does not fire", () => {
  assert.equal(swipeBackFires(swipe(aimed(0, 60, 30))), false);
});

test("a start 30px from the right edge does not fire", () => {
  assert.equal(swipeBackFires(swipe(aimed(0, 60, WIDTH - 30))), false);
});

test("a start 60px from either edge fires", () => {
  assert.equal(swipeBackFires(swipe(aimed(0, 60, 60))), true);
  assert.equal(swipeBackFires(swipe(aimed(0, 60, WIDTH - 60))), true);
});

test("a touch that starts on a field does not fire", () => {
  assert.equal(swipeBackFires(swipe({ ...aimed(0, 60), onControl: true })), false);
});

test("an open keyboard or a focused field does not fire", () => {
  assert.equal(swipeBackFires(swipe({ ...aimed(0, 60), keyboardOpen: true })), false);
  assert.equal(swipeBackFires(swipe({ ...aimed(0, 60), fieldFocused: true })), false);
});

test("a reorder handle or an ongoing reorder does not fire", () => {
  assert.equal(swipeBackFires(swipe({ ...aimed(0, 60), onHandle: true })), false);
  assert.equal(swipeBackFires(swipe({ ...aimed(0, 60), reordering: true })), false);
});

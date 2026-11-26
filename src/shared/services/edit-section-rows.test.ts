import assert from "node:assert/strict";
import test from "node:test";
import { editRowsInLibraryOrder } from "./edit-section-rows.ts";

function library(orders: number[]) {
  return orders.map((order) => ({ item: { id: String(order), order }, value: `line ${order}` }));
}

test("checked lines stay in library order, including after another check", () => {
  const rows = library([1, 2, 3, 4, 5]);
  const first = editRowsInLibraryOrder(rows, new Set(["1", "3"]));
  assert.deepEqual(
    first.map((entry) => entry.row.item.order),
    [1, 2, 3, 4, 5],
  );
  assert.deepEqual(
    first.map((entry) => entry.onCard),
    [true, false, true, false, false],
  );

  const next = editRowsInLibraryOrder(rows, new Set(["1", "3", "5"]));
  assert.deepEqual(
    next.map((entry) => entry.row.item.order),
    [1, 2, 3, 4, 5],
  );
  assert.equal(next[4]?.onCard, true);
});

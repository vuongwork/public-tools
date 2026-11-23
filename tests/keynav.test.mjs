import { test } from "node:test";
import assert from "node:assert/strict";
import { cellTarget } from "../docs/tools/expense-splitter/keynav.js";

const at = (ei, mi) => ({ ei, mi, nExp: 3, nMem: 4 });

test("arrows move between cells", () => {
  assert.deepEqual(cellTarget(at(1, 1), "up"), { type: "cell", ei: 1, mi: 0 });
  assert.deepEqual(cellTarget(at(1, 1), "down"), { type: "cell", ei: 1, mi: 2 });
  assert.deepEqual(cellTarget(at(1, 1), "left"), { type: "cell", ei: 0, mi: 1 });
  assert.deepEqual(cellTarget(at(1, 1), "right"), { type: "cell", ei: 2, mi: 1 });
});

test("arrows leave the cell area at the edges", () => {
  assert.deepEqual(cellTarget(at(2, 0), "up"), { type: "exp-name", ei: 2 });
  assert.deepEqual(cellTarget(at(0, 3), "left"), { type: "mem-name", mi: 3 });
  assert.equal(cellTarget(at(1, 3), "down"), null);
  assert.equal(cellTarget(at(2, 1), "right"), null);
});

test("next goes down the column, then to the next column, then to + Khoản", () => {
  assert.deepEqual(cellTarget(at(0, 1), "next"), { type: "cell", ei: 0, mi: 2 });
  assert.deepEqual(cellTarget(at(0, 3), "next"), { type: "cell", ei: 1, mi: 0 });
  assert.deepEqual(cellTarget(at(2, 3), "next"), { type: "add-exp" });
});

test("prev goes up the column and stays put on the first row", () => {
  assert.deepEqual(cellTarget(at(1, 2), "prev"), { type: "cell", ei: 1, mi: 1 });
  assert.deepEqual(cellTarget(at(1, 0), "prev"), { type: "cell", ei: 1, mi: 0 });
});

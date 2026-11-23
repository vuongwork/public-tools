import { test } from "node:test";
import assert from "node:assert/strict";
import { calculate, calculateExpense } from "../docs/tools/expense-splitter/calculate.js";

const members = [
  { id: "s", name: "Sếp" },
  { id: "a", name: "An" },
  { id: "b", name: "Bình" },
  { id: "c", name: "Chi" },
];

const cell = (patch = {}) => ({ on: true, paid: 0, extra: 0, treats: [], ...patch });
const expense = (cells, id = "e1") => ({ id, name: "Ăn tối", cells });
const sumValues = (obj) => Object.values(obj).reduce((a, b) => a + b, 0);

test("sếp mời 500k, có tick, vẫn góp phần chia đều", () => {
  const result = calculateExpense(members, expense({
    s: cell({ paid: 2_000_000, extra: 500_000 }), a: cell(), b: cell(), c: cell(),
  }));
  assert.equal(result.error, null);
  assert.equal(result.total, 2_000_000);
  assert.deepEqual(result.share, { s: 875_000, a: 375_000, b: 375_000, c: 375_000 });
});

test("sếp mời 500k, bỏ tick", () => {
  const result = calculateExpense(members, expense({
    s: cell({ on: false, paid: 2_000_000, extra: 500_000 }), a: cell(), b: cell(), c: cell(),
  }));
  assert.deepEqual(result.share, { s: 500_000, a: 500_000, b: 500_000, c: 500_000 });
});

test("nhiều người cùng trả", () => {
  const result = calculateExpense(members, expense({
    s: cell({ paid: 100 }), a: cell({ paid: 200 }), b: cell(), c: cell({ on: false }),
  }));
  assert.equal(result.total, 300);
  assert.deepEqual(result.paid, { s: 100, a: 200, b: 0, c: 0 });
  assert.deepEqual(result.share, { s: 100, a: 100, b: 100, c: 0 });
});

test("mời riêng chuyển phần của người được mời", () => {
  const result = calculateExpense(members, expense({
    s: cell({ paid: 400 }), a: cell({ treats: ["c"] }), b: cell(), c: cell(),
  }));
  assert.equal(result.error, null);
  assert.deepEqual(result.share, { s: 100, a: 200, b: 100, c: 0 });
});

test("dư đồng chia theo thứ tự thành viên", () => {
  const result = calculateExpense(members, expense({
    s: cell({ on: false, paid: 101 }), a: cell({ on: false }), b: cell(), c: cell(),
  }));
  assert.deepEqual(result.share, { s: 0, a: 0, b: 51, c: 50 });
});

test("tổng phải chịu bằng tổng khoản", () => {
  const cases = [
    { s: cell({ paid: 2_000_000, extra: 500_000 }), a: cell(), b: cell(), c: cell() },
    { s: cell({ on: false, paid: 2_000_000, extra: 500_000 }), a: cell(), b: cell(), c: cell() },
    { s: cell({ paid: 1001, extra: 7 }), a: cell({ paid: 3, treats: ["b"] }), b: cell(), c: cell() },
    { s: cell({ paid: 100_003 }), a: cell(), b: cell({ on: false, extra: 10 }), c: cell() },
  ];
  for (const cells of cases) {
    const result = calculateExpense(members, expense(cells));
    assert.equal(result.error, null);
    assert.equal(sumValues(result.share), result.total);
  }
});

test("báo lỗi", () => {
  const errorOf = (cells) => calculateExpense(members, expense(cells)).error;
  assert.equal(errorOf({ s: cell({ paid: 100, extra: 300 }) }),
    "Tổng phần riêng lớn hơn tổng khoản.");
  assert.equal(errorOf({ s: cell({ on: false, paid: 100 }), a: cell({ on: false }) }),
    "Chưa ai được tick để chia phần còn lại.");
  assert.equal(errorOf({ s: cell({ paid: 100 }), a: cell({ on: false, treats: ["b"] }), b: cell() }),
    "An mời riêng nhưng chưa tick.");
  assert.equal(errorOf({ s: cell({ paid: 100 }), a: cell({ treats: ["b"] }), b: cell({ on: false }) }),
    "Bình được mời nhưng chưa tick.");
  assert.equal(errorOf({ s: cell({ paid: 100, treats: ["b"] }), a: cell({ treats: ["b"] }), b: cell() }),
    "Bình được hai người mời.");
  assert.equal(errorOf({ s: cell({ paid: 100 }), a: cell({ treats: ["b"] }), b: cell({ treats: ["c"] }), c: cell() }),
    "Bình vừa được mời vừa mời người khác.");
  assert.equal(errorOf({ s: cell({ paid: 100 }), a: cell({ treats: ["b"] }), b: cell({ treats: ["a"] }) }),
    "Bình vừa được mời vừa mời người khác.");
});

test("tự mời mình hoặc id lạ thì bỏ qua", () => {
  const result = calculateExpense(members, expense({
    s: cell({ paid: 300, treats: ["s", "zzz"] }), a: cell(), b: cell(), c: cell({ on: false }),
  }));
  assert.equal(result.error, null);
  assert.deepEqual(result.share, { s: 100, a: 100, b: 100, c: 0 });
});

test("khoản trống hợp lệ, tổng 0", () => {
  const result = calculateExpense(members, expense({}));
  assert.equal(result.error, null);
  assert.equal(result.total, 0);
});

test("khoản lỗi không ảnh hưởng tổng kết", () => {
  const good = expense({ s: cell({ paid: 300 }), a: cell(), b: cell(), c: cell({ on: false }) }, "good");
  const bad = expense({ a: cell({ paid: 100, extra: 999 }) }, "bad");
  const both = calculate(members, [good, bad]);
  const only = calculate(members, [good]);
  assert.deepEqual(both.balances, only.balances);
  assert.deepEqual(both.transfers, only.transfers);
  assert.equal(both.total, 300);
  assert.equal(both.errors.bad, "Tổng phần riêng lớn hơn tổng khoản.");
  assert.equal(both.errors.good, undefined);
});

// Ported settlement cases from the original payer/participants tests.
const four = ["An", "Bình", "Chi", "Dũng"].map((name, index) => ({ id: String(index), name }));
const legacy = (amount, payer, participants, id) => ({
  id, name: id,
  cells: Object.fromEntries(four.map(({ id: m }) => [m, {
    on: participants.includes(m), paid: m === payer ? amount : 0, extra: 0, treats: [],
  }])),
});

test("chuyển khoản với nhiều khoản và người tham gia khác nhau", () => {
  const result = calculate(four, [legacy(300000, "0", ["0", "1", "2"], "x"), legacy(120000, "1", ["1", "2"], "y")]);
  assert.equal(result.total, 420000);
  assert.deepEqual(result.balances.map(({ share, net }) => [share, net]), [
    [100000, 200000], [160000, -40000], [160000, -160000], [0, 0],
  ]);
  assert.deepEqual(result.transfers, [
    { from: "1", to: "0", amount: 40000 },
    { from: "2", to: "0", amount: 160000 },
  ]);
});

test("một người nợ nhiều chủ nợ", () => {
  const result = calculate(four, [legacy(5, "0", ["2"], "x"), legacy(10, "1", ["2"], "y")]);
  assert.deepEqual(result.transfers, [
    { from: "2", to: "0", amount: 5 },
    { from: "2", to: "1", amount: 10 },
  ]);
});

test("cân bằng thì không có chuyển khoản", () => {
  assert.deepEqual(calculate(four, []).transfers, []);
  assert.deepEqual(calculate(four, [legacy(20, "0", ["0", "1"], "x"), legacy(20, "1", ["0", "1"], "y")]).transfers, []);
});

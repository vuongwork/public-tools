import { test } from "node:test";
import assert from "node:assert/strict";
import { calculate } from "../docs/tools/expense-splitter/calculate.js";
import {
  emptyTrip, addMember, renameMember, removeMember, addExpense, renameExpense, removeExpense,
  setCell, loadTrip,
} from "../docs/tools/expense-splitter/trip.js";

const deepFreeze = (value) => {
  if (value && typeof value === "object") {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
};

function sample() {
  let trip = emptyTrip();
  for (const name of ["An", "Bình", "Chi"]) trip = addMember(trip, name);
  trip = addExpense(trip, "Ăn tối");
  return trip;
}

test("addExpense tick sẵn mọi người", () => {
  const trip = sample();
  const [e] = trip.expenses;
  assert.equal(e.name, "Ăn tối");
  for (const { id } of trip.members) assert.equal(e.cells[id].on, true);
});

test("addMember không tick ở cột cũ", () => {
  const trip = addMember(sample(), "Dũng");
  const dung = trip.members.at(-1);
  assert.equal(dung.name, "Dũng");
  assert.equal(trip.expenses[0].cells[dung.id].on, false);
});

test("removeMember gỡ khỏi treats", () => {
  let trip = sample();
  const [an, , chi] = trip.members;
  const e = trip.expenses[0];
  trip = setCell(trip, e.id, an.id, { paid: 300, treats: [chi.id] });
  trip = removeMember(trip, chi.id);
  const cells = trip.expenses[0].cells;
  assert.deepEqual(cells[an.id].treats, []);
  assert.equal(chi.id in cells, false);
  assert.equal(trip.members.length, 2);
  assert.deepEqual(calculate(trip.members, trip.expenses).errors, {});
});

test("rename / remove expense, setCell merge", () => {
  let trip = sample();
  const e = trip.expenses[0];
  const an = trip.members[0];
  trip = renameExpense(trip, e.id, "Taxi");
  trip = renameMember(trip, an.id, "Ân");
  trip = setCell(trip, e.id, an.id, { paid: 50 });
  trip = setCell(trip, e.id, an.id, { extra: 10 });
  assert.equal(trip.expenses[0].name, "Taxi");
  assert.equal(trip.members[0].name, "Ân");
  assert.deepEqual(trip.expenses[0].cells[an.id], { on: true, paid: 50, extra: 10, treats: [] });
  trip = removeExpense(trip, e.id);
  assert.deepEqual(trip.expenses, []);
});

test("không sửa trip đầu vào", () => {
  const trip = deepFreeze(setCell(sample(), sample().expenses[0].id, "x", {}));
  const frozen = deepFreeze(sample());
  const [an, bình] = frozen.members;
  const e = frozen.expenses[0];
  assert.doesNotThrow(() => {
    addMember(frozen, "X");
    renameMember(frozen, an.id, "Y");
    removeMember(frozen, an.id);
    addExpense(frozen, "Z");
    renameExpense(frozen, e.id, "W");
    removeExpense(frozen, e.id);
    setCell(frozen, e.id, an.id, { paid: 1, treats: [bình.id] });
  });
  assert.ok(trip);
});

test("chuyển dữ liệu v1", () => {
  const v1 = JSON.stringify({
    name: "Đi biển",
    members: [{ id: "0", name: "An" }, { id: "1", name: "Bình" }, { id: "2", name: "Chi" }],
    expenses: [
      { id: "x", name: "Ăn", amount: 300000, payer: "0", participants: ["0", "1", "2"] },
      { id: "y", name: "Taxi", amount: 120000, payer: "1", participants: ["1", "2"] },
    ],
  });
  const { trip, warning } = loadTrip(null, v1);
  assert.equal(warning, null);
  assert.equal(trip.name, "Đi biển");
  assert.deepEqual(trip.expenses[0].cells["0"], { on: true, paid: 300000, extra: 0, treats: [] });
  assert.deepEqual(trip.expenses[0].cells["1"], { on: true, paid: 0, extra: 0, treats: [] });
  assert.equal(trip.expenses[1].cells["0"].on, false);
  const result = calculate(trip.members, trip.expenses);
  assert.deepEqual(result.balances.map(({ share, net }) => [share, net]), [
    [100000, 200000], [160000, -40000], [160000, -160000],
  ]);
});

test("ưu tiên v2", () => {
  const v2 = JSON.stringify(sample());
  const { trip } = loadTrip(v2, JSON.stringify({ name: "cũ", members: [], expenses: [] }));
  assert.equal(trip.members.length, 3);
});

test("không có gì lưu thì trống, không cảnh báo", () => {
  assert.deepEqual(loadTrip(null, null), { trip: emptyTrip(), warning: null });
});

test("dữ liệu hỏng", () => {
  for (const raw of ["{oops", '{"members":5}', '{"name":"x","members":[{"id":1}],"expenses":[]}']) {
    const { trip, warning } = loadTrip(raw, null);
    assert.deepEqual(trip, emptyTrip());
    assert.equal(warning, "Không thể đọc buổi đã lưu trên trình duyệt này.");
  }
});

test("nextName không trùng sau khi xóa", async () => {
  const { nextName } = await import("../docs/tools/expense-splitter/trip.js");
  assert.equal(nextName("Người", []), "Người 1");
  assert.equal(nextName("Người", [{ name: "Người 1" }, { name: "Người 3" }]), "Người 2");
  assert.equal(nextName("Khoản", [{ name: "Khoản 1" }, { name: "Khoản 2" }]), "Khoản 3");
});

test("setCell bỏ id lạ trong treats", () => {
  let trip = sample();
  const [an, bình] = trip.members;
  trip = setCell(trip, trip.expenses[0].id, an.id, { treats: [bình.id, "ghost", an.id] });
  assert.deepEqual(trip.expenses[0].cells[an.id].treats, [bình.id]);
});

test("dữ liệu lưu có id trùng hoặc id kiểu __proto__ bị từ chối", () => {
  const dup = JSON.stringify({ name: "", members: [{ id: "a", name: "A" }, { id: "a", name: "B" }], expenses: [] });
  assert.equal(loadTrip(dup, null).warning, "Không thể đọc buổi đã lưu trên trình duyệt này.");
  const dupExp = JSON.stringify({ name: "", members: [], expenses: [{ id: "x", name: "1", cells: {} }, { id: "x", name: "2", cells: {} }] });
  assert.equal(loadTrip(dupExp, null).warning, "Không thể đọc buổi đã lưu trên trình duyệt này.");
  const proto = JSON.stringify({ name: "", members: [{ id: "toString", name: "T" }], expenses: [{ id: "x", name: "1", cells: {} }] });
  const { trip, warning } = loadTrip(proto, null);
  assert.equal(warning, null);
  assert.deepEqual(trip.expenses[0].cells.toString, { on: false, paid: 0, extra: 0, treats: [] });
});

test("evidence: one photo list per trip; older per-expense lists are folded in", async () => {
  const T = await import("../docs/tools/expense-splitter/trip.js");
  let t = T.addExpense(T.addMember(T.emptyTrip(), "A"), "X");
  assert.deepEqual(t.evidence, []);
  t = T.setEvidence(t, ["a", "b", "a", 5]);
  assert.deepEqual(t.evidence, ["a", "b"]);
  assert.deepEqual(T.loadTrip(JSON.stringify(t)).trip.evidence, ["a", "b"]);
  const old = JSON.parse(JSON.stringify(t));
  delete old.evidence;
  old.expenses[0].evidence = ["p1", "p2"];
  const loaded = T.loadTrip(JSON.stringify(old)).trip;
  assert.deepEqual(loaded.evidence, ["p1", "p2"]);
  assert.equal("evidence" in loaded.expenses[0], false);
});

test("invoice identity: stored, validated on load, cleared for a new trip", async () => {
  const T = await import("../docs/tools/expense-splitter/trip.js");
  assert.equal(T.emptyTrip().invoice, null);
  const good = { code: "CTN-261123-01", issuedAt: "2026-11-23T10:20:45.000Z" };
  let t = T.setInvoice(T.addMember(T.emptyTrip(), "A"), good);
  assert.deepEqual(T.loadTrip(JSON.stringify(t)).trip.invoice, good);
  for (const bad of [{ code: "HD-1", issuedAt: good.issuedAt }, { code: good.code, issuedAt: "nope" }, { code: 5, issuedAt: good.issuedAt }, "x"]) {
    assert.equal(T.setInvoice(t, bad).invoice, null);
    assert.equal(T.loadTrip(JSON.stringify({ ...t, invoice: bad })).trip.invoice, null);
  }
  const old = JSON.parse(JSON.stringify(t));
  delete old.invoice;
  assert.equal(T.loadTrip(JSON.stringify(old)).trip.invoice, null, "saves from before invoices load fine");
});

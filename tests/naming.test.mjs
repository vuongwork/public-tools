import { test } from "node:test";
import assert from "node:assert/strict";
import { invoiceCode, nextSeq, fileStamp, displayStamp, slugify, fileName, dayKey } from "../docs/tools/expense-splitter/naming.js";

const AT = new Date(2026, 10, 23, 17, 20, 45);

test("invoice code: CTN-YYMMDD-NN, sequence grows past two digits", () => {
  assert.equal(dayKey(AT), "261123");
  assert.equal(invoiceCode(AT, 1), "CTN-261123-01");
  assert.equal(invoiceCode(AT, 12), "CTN-261123-12");
  assert.equal(invoiceCode(AT, 100), "CTN-261123-100");
  assert.equal(invoiceCode(new Date(2027, 0, 5), 3), "CTN-270105-03");
});

test("daily sequence restarts on a new day and survives garbage", () => {
  assert.deepEqual(nextSeq(null, AT), { d: "261123", n: 1 });
  assert.deepEqual(nextSeq({ d: "261123", n: 1 }, AT), { d: "261123", n: 2 });
  assert.deepEqual(nextSeq({ d: "261122", n: 9 }, AT), { d: "261123", n: 1 });
  assert.deepEqual(nextSeq({ d: "261123", n: "x" }, AT), { d: "261123", n: 1 });
  assert.deepEqual(nextSeq({ d: "261123", n: -4 }, AT), { d: "261123", n: 1 });
});

test("timestamps: sortable file stamp and display stamp, both to the second", () => {
  assert.equal(fileStamp(AT), "20261123-172045");
  assert.equal(fileStamp(new Date(2026, 0, 2, 3, 4, 5)), "20260102-030405");
  assert.deepEqual(displayStamp(AT), { date: "23/11/2026", time: "17:20:45" });
});

test("slug: no diacritics, đ → d, trimmed, capped, never empty", () => {
  assert.equal(slugify("Đi biển cuối tuần"), "di-bien-cuoi-tuan");
  assert.equal(slugify("  Ăn tối / 20% !!  "), "an-toi-20");
  assert.equal(slugify("***"), "chia-tien");
  assert.equal(slugify(""), "chia-tien");
  assert.equal(slugify("a".repeat(60)).length, 40);
  assert.ok(!slugify("abc def ".repeat(10)).endsWith("-"));
});

test("file name: code_slug_stamp.ext", () => {
  assert.equal(fileName("CTN-261123-01", "Đi biển cuối tuần", AT, "xlsx"), "CTN-261123-01_di-bien-cuoi-tuan_20261123-172045.xlsx");
});

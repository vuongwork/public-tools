import { test } from "node:test";
import assert from "node:assert/strict";
import { parseAmount, shortMoney, money } from "../docs/tools/expense-splitter/format.js";

test("parseAmount chấp nhận cách gõ tiền kiểu Việt", () => {
  const cases = {
    "300000": 300000, "300.000": 300000, "300,000": 300000, "300 000": 300000,
    "500k": 500000, "500K": 500000, "2tr": 2000000, "2 tr": 2000000, "2TR": 2000000,
    "1,5tr": 1500000, "1.5tr": 1500000, "1,25tr": 1250000, "2.5k": 2500,
    "": 0, "   ": 0, "0": 0,
  };
  for (const [input, expected] of Object.entries(cases)) assert.equal(parseAmount(input), expected, input);
});

test("parseAmount: phần nguyên có dấu nhóm trước k/tr", () => {
  assert.equal(parseAmount("1.200k"), 1_200_000);
  assert.equal(parseAmount("2.500k"), 2_500_000);
  assert.equal(parseAmount("1.000k"), 1_000_000);
  assert.equal(parseAmount("1,25tr"), 1_250_000);
  assert.equal(parseAmount("1.5k"), 1500);
  assert.equal(parseAmount("1,255tr"), 1_255_000_000);
});

test("parseAmount từ chối giá trị sai", () => {
  for (const input of ["-1", "30.00", "1.000,00", "abc", "1,2345tr", "1.5", "9007199254740992", "5kk"]) {
    assert.equal(parseAmount(input), null, input);
  }
});

test("shortMoney cho nhãn ô", () => {
  assert.equal(shortMoney(2000000), "2tr");
  assert.equal(shortMoney(1500000), "1,5tr");
  assert.equal(shortMoney(500000), "500k");
  assert.equal(shortMoney(80000), "80k");
  assert.equal(shortMoney(1234), "1.234");
});

test("money định dạng VND", () => {
  assert.equal(money(2000000).replace(/\s/g, " "), "2.000.000 ₫");
});

test("parseAmount: 1tr5 và đuôi đ/₫", () => {
  assert.equal(parseAmount("1tr5"), 1_500_000);
  assert.equal(parseAmount("2tr25"), 2_250_000);
  assert.equal(parseAmount("500.000đ"), 500_000);
  assert.equal(parseAmount("500.000 ₫"), 500_000);
  assert.equal(parseAmount("500kđ"), 500_000);
  assert.equal(parseAmount("1tr555"), null);
  assert.equal(parseAmount("đ"), null);
});

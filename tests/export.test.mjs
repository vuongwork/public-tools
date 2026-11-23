import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyTrip, addMember, addExpense, setCell } from "../docs/tools/expense-splitter/trip.js";
import { buildReport, reportSheets, cellTags, gridModel } from "../docs/tools/expense-splitter/report.js";
import { buildXlsx, crc32, columnName } from "../docs/tools/expense-splitter/xlsx.js";
import { wrapText } from "../docs/tools/expense-splitter/receipt.js";
import { invoiceHtml } from "../docs/tools/expense-splitter/invoice.js";
import { normalizePayment, paymentView, defaultMemo } from "../docs/tools/expense-splitter/payment.js";

const NOW = new Date(2026, 10, 23, 14, 5);
const QR = "data:image/png;base64,iVBORw0KGgo=";

function sampleTrip() {
  let t = { ...emptyTrip(), name: "Đi biển cuối tuần" };
  for (const name of ["An", "Bình", "Chi"]) t = addMember(t, name);
  t = addExpense(t, "Trà sữa");
  const [a, b, c] = t.members.map((m) => m.id);
  const e = t.expenses[0].id;
  for (const id of [a, b, c]) t = setCell(t, e, id, { on: true });
  t = setCell(t, e, a, { paid: 150000, treats: [c] });
  t = setCell(t, e, b, { extra: 20000 });
  t = addExpense(t, "Lỗi");
  const bad = t.expenses[1].id;
  for (const id of [a, b, c]) t = setCell(t, bad, id, { on: false });
  t = setCell(t, bad, b, { paid: 10000, extra: 50000 });
  return { t, ids: { a, b, c } };
}

test("buildReport carries totals, transfers with names, and skipped expenses", () => {
  const { t } = sampleTrip();
  const r = buildReport(t, NOW);
  assert.equal(r.title, "Đi biển cuối tuần");
  assert.equal(r.number, "CTN-261123-01", "provisional code when the trip has no invoice yet");
  assert.equal(r.stamp, "20261123-140500");
  assert.deepEqual(r.exported, { date: "23/11/2026", time: "14:05:00" });
  assert.equal(r.date, "23/11/2026");
  assert.equal(r.total, 150000);
  assert.deepEqual(r.skipped, ["Lỗi"]);
  assert.equal(r.expenses[0].people, 3);
  assert.equal(r.expenses[1].share, null);
  assert.equal(r.transferTotal, r.transfers.reduce((s, x) => s + x.amount, 0));
});

test("cellTags mirror the grid tags", () => {
  const { t, ids } = sampleTrip();
  const r = buildReport(t, NOW);
  assert.deepEqual(cellTags(r, r.expenses[0], ids.a).map((x) => x.text), ["trả 150k", "mời Chi"]);
  assert.deepEqual(cellTags(r, r.expenses[0], ids.b).map((x) => x.text), ["riêng 20k"]);
});

test("reportSheets: first sheet is the UI grid with ticks, tags, sums and payment info", () => {
  const { t } = sampleTrip();
  const r = buildReport(t, NOW);
  const [grid, shares, detail] = reportSheets(r, paymentView({ bank: "Vietcombank", account: "0123456789", owner: "Pham Van A" }, r));
  assert.equal(grid.name, "Bảng chia");
  const v = (cell) => (cell && typeof cell === "object" ? cell.v : cell);
  assert.deepEqual(grid.rows[3].map(v), ["Người \\ Khoản", "Trà sữa", "Lỗi", "Đã trả", "Phải chịu", "Còn lại"]);
  assert.equal(v(grid.rows[4][1]), 150000);
  assert.match(v(grid.rows[4][2]), /^Lỗi: /);
  const an = grid.rows[5];
  assert.equal(v(an[0]), "An");
  assert.equal(v(an[1]), "☑  trả 150k\n     mời Chi");
  assert.equal(v(an[2]), "☐");
  assert.deepEqual(an.slice(3).map(v), [150000, 86667, 63333]);
  assert.equal(an[5].s.fmt, "signed");
  const flat = grid.rows.flat().map(v);
  assert.ok(flat.includes("Chuyển khoản") && flat.includes("0123456789") && flat.includes("Vietcombank"));
  assert.deepEqual(grid.freeze, { row: 5, col: 1 });
  assert.equal(shares.name, "Phần chia");
  assert.equal(detail.rows.length, 1 + 2 * 3);
});

test("crc32 and column names", () => {
  assert.equal(crc32(new TextEncoder().encode("hello")), 0x3610a686);
  assert.deepEqual([0, 25, 26, 27, 701, 702].map(columnName), ["A", "Z", "AA", "AB", "ZZ", "AAA"]);
});

test("buildXlsx: zip parts, escaping, styles, merges and frozen panes", () => {
  const bytes = buildXlsx([
    { name: "A/B", rows: [["x < y & z", 1200, { v: 5, s: { fmt: "signed", bold: true, color: "B45A17" } }]], merges: ["A1:B1"], freeze: { row: 1, col: 1 } },
    { name: "A/B", rows: [] },
  ]);
  assert.deepEqual([...bytes.slice(0, 4)], [0x50, 0x4b, 0x03, 0x04]);
  const text = new TextDecoder().decode(bytes);
  for (const part of ["[Content_Types].xml", "xl/workbook.xml", "xl/styles.xml", "xl/worksheets/sheet2.xml"]) assert.ok(text.includes(part), part);
  assert.ok(text.includes("x &lt; y &amp; z"));
  assert.ok(text.includes('<sheet name="A B" sheetId="1"') && text.includes('<sheet name="A B 2" sheetId="2"'));
  assert.ok(text.includes('<c r="B1" s="1"><v>1200</v></c>'));
  assert.ok(text.includes('<mergeCell ref="A1:B1"/>'));
  assert.ok(text.includes('state="frozen"'));
  assert.ok(text.includes('<color rgb="FFB45A17"/>'));
});

test("invoiceHtml fills the template and escapes user text", () => {
  let { t } = sampleTrip();
  t = { ...t, members: t.members.map((m, i) => (i === 0 ? { ...m, name: "<b>An</b>" } : m)) };
  const r = buildReport(t, NOW);
  const html = invoiceHtml(r, paymentView({ bank: "Vietcombank", account: "0123 456 789", owner: "Pham Quoc Vuong", recipientId: t.members[0].id, qr: QR }, r));
  assert.ok(html.startsWith("<!doctype html>"));
  assert.ok(html.includes("HĐ #CTN-261123-01") && html.includes("Ngày lập: 23/11/2026 · 14:05") && html.includes("Xuất lúc 14:05:00 23/11/2026"));
  assert.ok(html.includes('<div class="v">2 khoản</div>'));
  assert.ok(html.includes("&lt;b&gt;An&lt;/b&gt;") && !html.includes("<b>An</b>"));
  assert.ok(html.includes('<span class="pay">trả 150k</span>'));
  assert.ok(html.includes('<span class="pay ex">riêng 20k</span>'));
  assert.ok(html.includes("Quét để chuyển cho &lt;b&gt;An&lt;/b&gt;"));
  assert.ok(html.includes(`src="${QR}"`));
  assert.ok(html.includes("PHAM QUOC VUONG"));
  assert.ok(html.includes("ND: CTN DIBIEN 2311 + tên bạn"));
  const bare = invoiceHtml(r, null);
  assert.ok(!bare.includes('class="card qrc"') && bare.includes('class="bot one"'), "no payment card without payment info");
});

test("payment: normalize drops bad fields, memo defaults from title and date", () => {
  assert.deepEqual(normalizePayment("{bad json"), { recipientId: "", bank: "", account: "", owner: "", memo: "", qr: "" });
  assert.equal(normalizePayment({ qr: "javascript:alert(1)" }).qr, "");
  assert.equal(normalizePayment({ qr: QR }).qr, QR);
  assert.equal(normalizePayment({ bank: 5 }).bank, "");
  assert.equal(defaultMemo({ title: "Đi biển cuối tuần", date: "23/11/2026" }), "CTN DIBIEN 2311 + tên bạn");
  assert.equal(paymentView({ memo: "  " }, { title: "X", date: "01/02/2026", members: [] }).show, false);
});

test("gridModel is the UI grid: one column per expense, ticks and tags per cell, sums per person", () => {
  const { t } = sampleTrip();
  const g = gridModel(buildReport(t, NOW));
  assert.deepEqual(g.columns.map((c) => [c.name, c.total, Boolean(c.error)]), [["Trà sữa", 150000, false], ["Lỗi", 10000, true]]);
  assert.deepEqual(g.rows.map((r) => r.name), ["An", "Bình", "Chi"]);
  assert.deepEqual(g.rows[0].cells.map((c) => [c.on, c.tags.map((x) => x.text)]), [[true, ["trả 150k", "mời Chi"]], [false, []]]);
  assert.deepEqual(g.rows[1].cells[1].tags.map((x) => x.text), ["trả 10k", "riêng 50k"], "unticked cell keeps its data");
  assert.deepEqual([g.rows[0].paid, g.rows[0].share, g.rows[0].net], [150000, 86667, 63333]);
  assert.deepEqual(g.foot, { totals: [{ total: 150000, error: false }, { total: 10000, error: true }], paid: 150000, share: 150000 });
});

test("wrapText wraps instead of cutting, and breaks a word longer than the line", () => {
  const measure = (s) => s.length; // 1 unit per character
  assert.deepEqual(wrapText(measure, "Vương Phạm Quốc", 100), ["Vương Phạm Quốc"]);
  assert.deepEqual(wrapText(measure, "Dimsum nhà hàng Kowloon", 10), ["Dimsum nhà", "hàng", "Kowloon"]);
  assert.deepEqual(wrapText(measure, "abcdefghijkl", 5), ["abcde", "fghij", "kl"]);
  assert.equal(wrapText(measure, "Dimsum nhà hàng Kowloon tầng 3", 8).join(" "), "Dimsum nhà hàng Kowloon tầng 3");
});

test("invoiceHtml keeps one grid like the UI and widens the page for many expenses, plus chứng từ page", () => {
  let t = emptyTrip();
  for (const name of ["A", "B"]) t = addMember(t, name);
  for (let i = 1; i <= 9; i++) {
    t = addExpense(t, `K${i}`);
    t = setCell(t, t.expenses.at(-1).id, t.members[0].id, { paid: 10000 });
  }
  t = { ...t, evidence: ["p1", "p2"] };
  const html = invoiceHtml(buildReport(t, NOW), null, { images: new Map([["p1", QR]]) });
  assert.equal((html.match(/<table>/g) ?? []).length, 1, "never split");
  assert.equal((html.match(/<th class="it/g) ?? []).length, 9);
  assert.ok(html.includes("Người \\ Khoản"));
  assert.ok(html.includes('<th class="sm">Phải trả</th></tr>') && !html.includes(">Còn lại</th>") && !html.includes(">Đã trả</th>"));
  assert.ok(html.includes("@page{size:356mm 297mm}.pg{width:356mm}"));
  assert.ok(!html.includes('class="ia ev"'), "no per-expense codes");
  assert.ok(html.includes("Chứng từ thanh toán") && html.includes(`<img src="${QR}" alt="Chứng từ CT1">`));
  assert.ok(html.includes("📎 CT2 · không tải được ảnh"), "missing photo is listed, not dropped");
  const small = invoiceHtml(buildReport({ ...t, expenses: t.expenses.slice(0, 2) }, NOW));
  assert.ok(!small.includes("@page{size:") || small.includes("@page{size:A4"), "A4 when it fits");
  assert.ok(small.includes('<td class="r pt">10.000 <span class="d">₫</span></td>'), "Phải trả = phần chia");
});

test("invoice identity is stable: a re-export keeps the code and issue date, only the export time moves", () => {
  const { t } = sampleTrip();
  const issued = { code: "CTN-261120-07", issuedAt: new Date(2026, 10, 20, 9, 30).toISOString() };
  const trip = { ...t, invoice: issued };
  const first = buildReport(trip, new Date(2026, 10, 20, 9, 31, 2));
  const later = buildReport(trip, new Date(2026, 10, 23, 18, 0, 59));
  assert.equal(first.number, "CTN-261120-07");
  assert.equal(later.number, "CTN-261120-07");
  assert.deepEqual([later.date, later.time], ["20/11/2026", "09:30"]);
  assert.equal(later.exported.date, "23/11/2026");
  assert.notEqual(first.stamp, later.stamp);
});

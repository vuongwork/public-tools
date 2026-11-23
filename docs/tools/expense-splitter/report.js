import { calculate, calculateExpense } from "./calculate.js";
import { shortMoney } from "./format.js";
import { columnName } from "./xlsx.js";
import { invoiceCode, displayStamp, fileStamp } from "./naming.js";

const nameIn = (members, id) => members.find((m) => m.id === id)?.name ?? "";

/**
 * Everything an export needs, computed once from the trip.
 * expenses[i].share is null when the expense has an error (it is then left out of totals).
 * number / date / time: the invoice's identity and issue time — stable, taken from trip.invoice
 *   (a trip without one gets a provisional CTN-YYMMDD-01 for `now`).
 * exported / stamp: when this export was made, for display and for file names (changes every time).
 */
export function buildReport(trip, now = new Date()) {
  const { members } = trip;
  const result = calculate(members, trip.expenses);
  const expenses = trip.expenses.map((expense) => {
    const split = calculateExpense(members, expense);
    const cell = (id) => ({ on: false, paid: 0, extra: 0, treats: [], ...(expense.cells?.[id] ?? {}) });
    return {
      id: expense.id,
      name: expense.name,
      total: split.total,
      error: split.error,
      share: split.error ? null : split.share,
      people: members.filter((m) => cell(m.id).on).length,
      cells: Object.fromEntries(members.map((m) => [m.id, cell(m.id)])),
    };
  });
  const issuedAt = new Date(trip.invoice?.issuedAt ?? now);
  const issued = Number.isNaN(issuedAt.getTime()) ? now : issuedAt;
  const transfers = result.transfers.map((t) => ({ ...t, fromName: nameIn(members, t.from), toName: nameIn(members, t.to) }));
  return {
    title: trip.name?.trim() || "Chia tiền nhóm",
    number: trip.invoice?.code ?? invoiceCode(issued, 1),
    date: displayStamp(issued).date,
    time: displayStamp(issued).time.slice(0, 5),
    exported: displayStamp(now),
    stamp: fileStamp(now),
    members: members.map(({ id, name }) => ({ id, name })),
    expenses,
    total: result.total,
    balances: result.balances,
    transfers,
    transferTotal: transfers.reduce((s, t) => s + t.amount, 0),
    skipped: expenses.filter((e) => e.error).map((e) => e.name),
    // Chứng từ for the whole trip, numbered CT1, CT2… in upload order.
    evidence: (trip.evidence ?? []).map((id, k) => ({ id, code: `CT${k + 1}` })),
  };
}

/** The tags a grid cell shows on the UI: "trả 350k", "riêng 20k", "mời Linh". */
export function cellTags(report, expense, memberId) {
  const c = expense.cells[memberId];
  const tags = [];
  if (c.paid) tags.push({ kind: "paid", text: `trả ${shortMoney(c.paid)}` });
  if (c.extra) tags.push({ kind: "extra", text: `riêng ${shortMoney(c.extra)}` });
  const treated = c.treats.map((id) => nameIn(report.members, id)).filter(Boolean);
  if (treated.length) tags.push({ kind: "treat", text: `mời ${treated.join(", ")}` });
  return tags;
}

/**
 * The UI grid as data (same rows, columns and tags as the screen), shared by the image and HTML exports.
 * columns: one per expense { name, total, error }
 * rows: one per person { name, cells: [{ on, error, tags: [{ kind, text }] }], paid, share, net }
 * foot: { totals: [{ total, error }], paid, share }
 */
export function gridModel(report) {
  return {
    columns: report.expenses.map((e) => ({ name: e.name, total: e.total, error: e.error })),
    rows: report.balances.map((b) => ({
      name: b.name,
      cells: report.expenses.map((e) => ({ on: e.cells[b.id].on, error: Boolean(e.error), tags: cellTags(report, e, b.id) })),
      paid: b.paid,
      share: b.share,
      net: b.net,
    })),
    foot: {
      totals: report.expenses.map((e) => ({ total: e.total, error: Boolean(e.error) })),
      paid: report.balances.reduce((s, b) => s + b.paid, 0),
      share: report.balances.reduce((s, b) => s + b.share, 0),
    },
  };
}

// UI palette (style.css)
const C = {
  teal: "0B6F73", amber: "C9862F", pos: "08807B", neg: "B45A17", muted: "55777B", ink: "0D3A42", error: "C2412D",
  head: "F1F8F7", wash: "E9F4F2", off: "F7FAF9", sum: "FAFDFC", errorFill: "FDF0ED", paid: "D8F0EC",
};

/**
 * Sheets for buildXlsx():
 *  - "Bảng chia": the UI grid as is (ticks + tags per cell, Đã trả / Phải chịu / Còn lại, Tổng),
 *    then Chuyển khoản and Thông tin nhận tiền.
 *  - "Phần chia": what each person bears in each expense.
 *  - "Chi tiết": one row per (khoản, người) with every input.
 * pay: paymentView() result or null.
 */
export function reportSheets(report, pay = null) {
  const nE = report.expenses.length;
  const last = nE + 3; // index of "Còn lại"
  const cols = columnName;
  const H = { bold: true, fill: C.head, border: true, wrap: true, color: C.ink };
  const T = (v, s) => ({ v, s });

  const rows = [];
  const heights = {};
  const merges = [];
  const push = (row, height) => { rows.push(row); if (height) heights[rows.length] = height; };

  push([T(`Chia Tiền Nhóm · ${report.title}`, { bold: true, size: 15, color: C.teal })], 26);
  merges.push(`A1:${cols(last)}1`);
  push([T(`HĐ #${report.number} · Ngày lập ${report.date} ${report.time} · Xuất lúc ${report.exported.time} ${report.exported.date} · ${report.members.length} người · ${nE} khoản · Tổng chi ${report.total.toLocaleString("vi-VN")} ₫`, { color: C.muted })]);
  merges.push(`A2:${cols(last)}2`);
  push([]);

  // Header: names, then a row of expense totals (as under each name on the UI).
  push([
    T("Người \\ Khoản", { ...H, color: C.muted, size: 9 }),
    ...report.expenses.map((e) => T(e.name, { ...H, fill: e.error ? C.errorFill : C.head })),
    T("Đã trả", { ...H, align: "right", color: C.muted }),
    T("Phải chịu", { ...H, align: "right", color: C.muted }),
    T("Còn lại", { ...H, align: "right", color: C.muted }),
  ], 22);
  push([
    T("", H),
    ...report.expenses.map((e) => (e.error
      ? T(`Lỗi: ${e.error}`, { ...H, bold: false, size: 9, color: C.error, fill: C.errorFill })
      : T(e.total, { ...H, color: C.teal, align: "left", fmt: "money" }))),
    T("", H), T("", H), T("", H),
  ], report.expenses.some((e) => e.error) ? 30 : 18);
  const headerRows = rows.length;

  for (const b of report.balances) {
    let lines = 1;
    const cells = report.expenses.map((e) => {
      const c = e.cells[b.id];
      const tags = cellTags(report, e, b.id).map((t) => t.text);
      lines = Math.max(lines, tags.length || 1);
      const text = `${c.on ? "☑" : "☐"}${tags.length ? `  ${tags.join("\n     ")}` : ""}`;
      return T(text, {
        border: true, wrap: true, valign: "top",
        fill: e.error ? C.errorFill : c.on ? undefined : C.off,
        color: c.on ? C.ink : C.muted,
      });
    });
    push([
      T(b.name, { bold: true, border: true, valign: "top" }),
      ...cells,
      T(b.paid, { border: true, fill: C.sum, valign: "top" }),
      T(b.share, { border: true, fill: C.sum, valign: "top" }),
      T(b.net, { border: true, bold: true, fmt: "signed", valign: "top", color: b.net > 0 ? C.pos : b.net < 0 ? C.neg : C.muted }),
    ], lines > 1 ? 15 * lines + 4 : 20);
  }

  const F = { bold: true, fill: C.wash, border: true };
  push([
    T("Tổng", F),
    ...report.expenses.map((e) => T(e.total, { ...F, strike: Boolean(e.error), color: e.error ? C.muted : C.ink })),
    T(report.balances.reduce((s, b) => s + b.paid, 0), F),
    T(report.balances.reduce((s, b) => s + b.share, 0), F),
    T("", F),
  ], 20);

  push([T("+ được nhận   − phải trả   ☑ có tham gia   ☐ không tham gia. Khoản lỗi chưa được tính. Số lẻ đến đồng cộng cho người đứng đầu danh sách.", { size: 9, color: C.muted })]);
  merges.push(`A${rows.length}:${cols(last)}${rows.length}`);
  push([]);

  push([T("Chuyển khoản", { bold: true, size: 13, color: C.ink }), null, T(report.transferTotal, { bold: true, color: C.teal })], 22);
  if (report.transfers.length) {
    push([T("Người chuyển", H), T("Người nhận", H), T("Số tiền", { ...H, align: "right" })]);
    for (const t of report.transfers) {
      push([T(t.fromName, { border: true, fill: C.head }), T(`→ ${t.toName}`, { border: true, fill: C.head }),
        T(t.amount, { border: true, bold: true, color: C.amber, fill: C.head })]);
    }
  } else {
    push([T("Không ai cần chuyển tiền.", { color: C.muted })]);
  }
  if (report.skipped.length) push([T(`Đang bỏ qua khoản lỗi: ${report.skipped.join(", ")}`, { color: C.error })]);

  if (pay?.show) {
    push([]);
    push([T("Thông tin nhận tiền", { bold: true, size: 13, color: C.ink })], 22);
    const info = [
      ["Người nhận", pay.recipientName],
      ["Ngân hàng", pay.bank],
      ["Số tài khoản", pay.account],
      ["Chủ tài khoản", pay.owner],
      ["Nội dung CK", pay.memo],
    ].filter(([, v]) => v);
    for (const [label, value] of info) {
      push([T(label, { color: C.muted, border: true }), T(value, {
        border: true, fmt: "text", bold: label === "Số tài khoản", color: label === "Số tài khoản" ? C.teal : C.ink,
      })]);
      merges.push(`B${rows.length}:${cols(Math.max(2, Math.min(last, 4)))}${rows.length}`);
    }
    if (pay.qr) push([T("Mã QR có trong hóa đơn HTML / ảnh hóa đơn.", { size: 9, color: C.muted })]);
  }
  if (report.evidence.length) {
    push([]);
    push([T(`Chứng từ thanh toán: ${report.evidence.length} ảnh (${report.evidence.map((x) => x.code).join(", ")}), xem trong hóa đơn HTML / ảnh hóa đơn.`, { color: C.muted })]);
  }

  const grid = {
    name: "Bảng chia",
    rows,
    widths: [18, ...report.expenses.map(() => 20), 14, 14, 14],
    merges,
    heights,
    freeze: { row: headerRows, col: 1 },
  };

  // ---- Phần chia ----
  const valid = report.expenses.filter((e) => !e.error);
  const shares = {
    name: "Phần chia",
    rows: [
      [T("Người", H), ...valid.map((e) => T(e.name, H)), T("Phải chịu", { ...H, align: "right" })],
      ...report.members.map((m) => [T(m.name, { bold: true, border: true }),
        ...valid.map((e) => T(e.share[m.id], { border: true })),
        T(valid.reduce((s, e) => s + e.share[m.id], 0), { border: true, bold: true, color: C.amber })]),
      [T("Tổng khoản", F), ...valid.map((e) => T(e.total, F)), T(valid.reduce((s, e) => s + e.total, 0), F)],
    ],
    widths: [18, ...valid.map(() => 16), 16],
    freeze: { row: 1, col: 1 },
  };

  // ---- Chi tiết ----
  const head = ["Khoản", "Người", "Tham gia", "Đã trả", "Phần riêng", "Mời riêng cho", "Phải chịu", "Ghi chú"];
  const detailRows = [head.map((h) => T(h, H))];
  for (const e of report.expenses) {
    for (const m of report.members) {
      const c = e.cells[m.id];
      const s = { border: true, fill: e.error ? C.errorFill : undefined };
      detailRows.push([
        T(e.name, s), T(m.name, s), T(c.on ? "☑" : "☐", { ...s, align: "center" }),
        T(c.paid || "", s), T(c.extra || "", s),
        T(c.treats.map((id) => nameIn(report.members, id)).filter(Boolean).join(", "), s),
        T(e.share ? e.share[m.id] : "", s),
        T(e.error ? `Lỗi: ${e.error}` : "", { ...s, color: C.error }),
      ]);
    }
  }
  const detail = { name: "Chi tiết", rows: detailRows, widths: [20, 18, 10, 14, 14, 20, 14, 36], freeze: { row: 1 } };

  return [grid, shares, detail];
}

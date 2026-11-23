import { calculate } from "./calculate.js";
import { money, parseAmount, shortMoney } from "./format.js";
import { cellTarget } from "./keynav.js";
import { buildReport, reportSheets } from "./report.js";
import { buildXlsx } from "./xlsx.js";
import { drawReceipt } from "./receipt.js";
import { invoiceHtml } from "./invoice.js";
import { PAYMENT_KEY, normalizePayment, paymentView, defaultMemo } from "./payment.js";
import { putPhoto, getPhoto, deletePhoto, photoIds, compressPhoto, blobToDataUrl } from "./evidence.js";
import { setEvidence, setInvoice } from "./trip.js";
import { SEQ_KEY, invoiceCode, nextSeq, fileName } from "./naming.js";
import {
  emptyTrip, addMember, renameMember, removeMember, addExpense, renameExpense, removeExpense,
  setCell, loadTrip, nextName,
} from "./trip.js";

const KEY = "public-tools:expense-splitter:v2";
const LEGACY_KEY = "public-tools:expense-splitter:v1";
const $ = (id) => document.getElementById(id);
const grid = $("grid");
const popover = $("cell-popover");

let trip = emptyTrip();
let undo = null; // { trip, message }
let openCell = null; // { expenseId, memberId }
let summary = "";

// ---------- storage ----------
function read(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
{
  const loaded = loadTrip(read(KEY), read(LEGACY_KEY));
  trip = loaded.trip;
  if (loaded.warning) $("storage-status").textContent = loaded.warning;
}
function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(trip));
    $("storage-status").textContent = "";
  } catch {
    $("storage-status").textContent = "Không thể tự lưu. Hãy sao chép kết quả trước khi đóng trang.";
  }
}

// Rebuilding the grid while a pointer is down detaches the element about to receive
// the click, so renders requested mid-press wait until the click has been dispatched.
let pointerDown = false;
let renderPending = false;
document.addEventListener("pointerdown", () => { pointerDown = true; }, true);
document.addEventListener("pointerup", () => {
  pointerDown = false;
  setTimeout(() => { if (renderPending) render(); }, 0);
}, true);
document.addEventListener("pointercancel", () => { pointerDown = false; }, true);

function scheduleRender() {
  if (pointerDown) renderPending = true;
  else render();
}

function update(fn, undoMessage) {
  undo = undoMessage ? { trip, message: undoMessage } : null;
  trip = fn(trip);
  save();
  scheduleRender();
}

// Renames commit on blur; defer so the Tab/click that caused the blur lands first.
function updateLater(fn) {
  trip = fn(trip);
  undo = null;
  save();
  setTimeout(scheduleRender, 0);
}

// ---------- DOM helpers ----------
function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === "class") node.className = value;
    else if (key === "dataset") Object.assign(node.dataset, value);
    else if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
    else if (key in node) node[key] = value;
    else node.setAttribute(key, value);
  }
  node.append(...children.filter((c) => c != null && c !== false));
  return node;
}

const nameOf = (id) => trip.members.find((m) => m.id === id)?.name ?? "";
const expenseOf = (id) => trip.expenses.find((e) => e.id === id);

function signed(net) {
  if (net > 0) return el("span", { class: "pos" }, `+${money(net)}`);
  if (net < 0) return el("span", { class: "neg" }, `−${money(-net)}`);
  return el("span", { class: "muted" }, "0");
}

// Enter commits the name and hands focus to onEnter (the next logical field).
function nameInput(value, label, key, onCommit, onEnter) {
  return el("input", {
    class: "name-input", value, maxLength: 60, "aria-label": label, dataset: { key },
    onchange: (event) => {
      const name = event.target.value.trim();
      if (name) onCommit(name);
      else event.target.value = value;
    },
    onkeydown: (event) => {
      if (event.key !== "Enter" || event.isComposing) return;
      event.preventDefault();
      event.target.blur();
      onEnter?.();
    },
  });
}

// ---------- render ----------
function render() {
  renderPending = false;
  const active = document.activeElement;
  const focusKey = active?.dataset?.key;
  const selection = active?.classList?.contains("name-input") ? [active.selectionStart, active.selectionEnd] : null;
  const result = calculate(trip.members, trip.expenses);
  const byId = new Map(result.balances.map((b) => [b.id, b]));
  const errorCls = (e) => (result.errors[e.id] ? "has-error" : "");

  const head = el("tr", {},
    el("th", { class: "sticky corner", scope: "col" }, "Người \\ Khoản"),
    ...trip.expenses.map((e, i) => el("th", { class: `exp ${errorCls(e)}`, scope: "col" },
      el("div", { class: "exp-head" },
        nameInput(e.name, `Tên khoản ${i + 1}`, `exp-name-${e.id}`, (name) => updateLater((t) => renameExpense(t, e.id, name)),
          () => focusTarget(trip.members.length ? { type: "cell", ei: i, mi: 0 } : { type: "add-mem" })),
        el("button", {
          type: "button", class: "icon", tabIndex: -1, "aria-label": `Xóa khoản ${e.name}`, dataset: { key: `exp-del-${e.id}` },
          onclick: () => update((t) => removeExpense(t, e.id), `Đã xóa khoản “${e.name}”.`),
        }, "✕")),
      el("div", { class: "exp-total" }, money(totalOf(e)),
        el("span", { class: "exp-tools" },
          trip.members.length > 0 && el("button", {
            type: "button", class: "tick-all", tabIndex: -1, dataset: { key: `tick-all-${e.id}` },
            "aria-label": `${allOn(e) ? "Bỏ tick" : "Tick"} tất cả cho ${e.name}`,
            onclick: () => toggleAll(e.id),
          }, allOn(e) ? "Bỏ hết" : "Tick hết"))),
      result.errors[e.id] && el("div", { class: "exp-error" }, result.errors[e.id]))),
    el("th", { class: "add-col", scope: "col" },
      el("button", { type: "button", class: "secondary", dataset: { key: "add-exp" }, onclick: onAddExpense }, "+ Khoản")),
    el("th", { class: "sum", scope: "col" }, "Đã trả"),
    el("th", { class: "sum", scope: "col" }, "Phải chịu"),
    el("th", { class: "sum", scope: "col" }, "Còn lại"));

  const rows = trip.members.map((m, mi) => {
    const b = byId.get(m.id);
    return el("tr", {},
      el("th", { class: "sticky", scope: "row" },
        el("div", { class: "member-head" },
          nameInput(m.name, `Tên người: ${m.name}`, `mem-name-${m.id}`, (name) => updateLater((t) => renameMember(t, m.id, name)),
            () => (mi < trip.members.length - 1 ? focusTarget({ type: "mem-name", mi: mi + 1 }) : onAddMember())),
          el("button", {
            type: "button", class: "icon", tabIndex: -1, "aria-label": `Xóa ${m.name}`, dataset: { key: `mem-del-${m.id}` },
            onclick: () => update((t) => removeMember(t, m.id), `Đã xóa “${m.name}”.`),
          }, "✕"))),
      ...trip.expenses.map((e) => cellView(e, m, errorCls(e))),
      el("td", { class: "add-col" }),
      el("td", { class: "sum" }, money(b.paid)),
      el("td", { class: "sum" }, money(b.share)),
      el("td", { class: "sum net" }, signed(b.net)));
  });

  const addRow = el("tr", { class: "add-row" },
    el("th", { class: "sticky", scope: "row" },
      el("button", { type: "button", class: "secondary", dataset: { key: "add-mem" }, onclick: onAddMember }, "+ Người")),
    el("td", { colSpan: trip.expenses.length + 4, class: "muted" },
      trip.members.length ? "" : "Thêm người trước, rồi thêm khoản chi."));

  const foot = el("tr", {},
    el("th", { class: "sticky", scope: "row" }, "Tổng"),
    ...trip.expenses.map((e) => el("td", { class: `exp ${errorCls(e)}`, title: result.errors[e.id] ? "Khoản lỗi, chưa tính vào tổng" : "" }, result.errors[e.id] ? el("s", {}, money(totalOf(e))) : money(totalOf(e)))),
    el("td", { class: "add-col" }),
    el("td", { class: "sum" }, money(result.balances.reduce((s, b) => s + b.paid, 0))),
    el("td", { class: "sum" }, money(result.balances.reduce((s, b) => s + b.share, 0))),
    el("td", { class: "sum" }));

  grid.replaceChildren(el("thead", {}, head), el("tbody", {}, ...rows, addRow), el("tfoot", {}, foot));

  renderUndo();
  renderSettlement(result);
  if (openCell) positionPopover();
  if (openCell) refreshPopoverBody();
  if (focusKey) {
    const node = document.querySelector(`[data-key="${CSS.escape(focusKey)}"]`);
    node?.focus();
    if (node && selection) try { node.setSelectionRange(...selection); } catch { /* not a text field */ }
  }
}

const allOn = (expense) => trip.members.every((m) => expense.cells[m.id]?.on);

/** Ticks everyone in an expense, or unticks everyone when all are already ticked. */
function toggleAll(expenseId) {
  const on = !allOn(expenseOf(expenseId));
  update((t) => t.members.reduce((acc, m) => setCell(acc, expenseId, m.id, { on }), t));
}

function totalOf(expense) {
  return Object.values(expense.cells).reduce((s, c) => s + c.paid, 0);
}

function cellView(expense, member, errorClass) {
  const cell = expense.cells[member.id];
  const labels = [];
  if (cell.paid) labels.push(el("span", { class: "tag paid" }, `trả ${shortMoney(cell.paid)}`));
  if (cell.extra) labels.push(el("span", { class: "tag extra" }, `riêng ${shortMoney(cell.extra)}`));
  if (cell.treats.some(nameOf)) labels.push(el("span", { class: "tag treat" }, `mời ${cell.treats.map(nameOf).filter(Boolean).join(", ")}`));
  const isOpen = openCell?.expenseId === expense.id && openCell?.memberId === member.id;
  return el("td", {
    class: `cell ${errorClass} ${cell.on ? "on" : "off"} ${isOpen ? "open" : ""}`,
    dataset: { expense: expense.id, member: member.id },
    onclick: (event) => {
      if (event.target.closest("label.check")) return;
      openPopover(expense.id, member.id);
    },
  },
  // Label gives the checkbox a ≥44px tap target.
  el("label", { class: "check" }, el("input", {
    type: "checkbox", checked: cell.on, dataset: { key: `on-${expense.id}-${member.id}` },
    "aria-label": `${member.name} tham gia ${expense.name}. Enter hoặc gõ số để nhập tiền`,
    onchange: (event) => update((t) => setCell(t, expense.id, member.id, { on: event.target.checked })),
  })),
  el("button", {
    type: "button", class: "cell-edit", tabIndex: -1, dataset: { key: `edit-${expense.id}-${member.id}` },
    "aria-label": [`Chi tiết ${member.name} · ${expense.name}`, ...labels.map((l) => l.textContent)].join(", "),
    "aria-haspopup": "dialog",
  }, labels.length ? el("span", { class: "tags" }, ...labels) : el("span", { class: "pen", "aria-hidden": "true" }, "+ tiền")));
}

function renderUndo() {
  const bar = $("undo-bar");
  bar.replaceChildren();
  if (!undo) return;
  bar.append(undo.message, " ", el("button", {
    type: "button", class: "linkish",
    onclick: () => { trip = { ...undo.trip, invoice: undo.trip.invoice ?? trip.invoice }; undo = null; save(); render(); },
  }, "Hoàn tác"));
}

function renderSettlement(result) {
  const { balances, transfers, errors, total } = result;
  $("total").textContent = money(total);
  const name = (id) => balances.find((b) => b.id === id).name;
  $("transfers").replaceChildren(...transfers.map((t) => el("li", {}, el("span", {}, `${name(t.from)} → ${name(t.to)}`), el("strong", {}, money(t.amount)))));
  const skipped = trip.expenses.filter((e) => errors[e.id]);
  $("settlement-hint").textContent = !trip.expenses.length ? "Chưa có khoản chi."
    : transfers.length ? "" : "Không ai cần chuyển tiền.";
  if (skipped.length) {
    $("settlement-hint").textContent = `${$("settlement-hint").textContent} Đang bỏ qua khoản lỗi: ${skipped.map((e) => e.name).join(", ")}.`.trim();
  }

  const lines = [`${trip.name || "Chia tiền nhóm"} — tổng ${money(total)}`];
  for (const b of balances) {
    const net = b.net > 0 ? `+${money(b.net)}` : b.net < 0 ? `−${money(-b.net)}` : "0";
    lines.push(`${b.name}: trả ${money(b.paid)}, chịu ${money(b.share)}, còn ${net}`);
  }
  if (transfers.length) {
    lines.push("Chuyển khoản:");
    for (const t of transfers) lines.push(`${name(t.from)} → ${name(t.to)}: ${money(t.amount)}`);
  }
  if (skipped.length) lines.push(`Bỏ qua (lỗi): ${skipped.map((e) => e.name).join(", ")}`);
  summary = lines.join("\n");
  $("summary-text").value = summary;
  for (const id of ["copy", "excel", "receipt", "invoice"]) $(id).disabled = !trip.expenses.length;
  renderPaymentChoices();
  renderEvidencePanel();
}

// ---------- add ----------
function onAddMember() {
  update((t) => addMember(t, nextName("Người", t.members)));
  focusSelect(`mem-name-${trip.members.at(-1).id}`);
}
function onAddExpense() {
  update((t) => addExpense(t, nextName("Khoản", t.expenses)));
  focusSelect(`exp-name-${trip.expenses.at(-1).id}`);
}
function focusSelect(key) {
  const input = grid.querySelector(`[data-key="${CSS.escape(key)}"]`);
  input?.focus();
  input?.select();
}

// ---------- keyboard navigation ----------
function cellPos(expenseId, memberId) {
  return {
    ei: trip.expenses.findIndex((e) => e.id === expenseId),
    mi: trip.members.findIndex((m) => m.id === memberId),
    nExp: trip.expenses.length,
    nMem: trip.members.length,
  };
}

/** Focuses a target from cellTarget() (or { type: "add-mem" }); name fields get their text selected. */
function focusTarget(target) {
  if (!target) return;
  const focusKey = (key) => grid.querySelector(`[data-key="${CSS.escape(key)}"]`)?.focus();
  const exp = trip.expenses[target.ei];
  const mem = trip.members[target.mi];
  if (target.type === "cell" && exp && mem) focusKey(`on-${exp.id}-${mem.id}`);
  else if (target.type === "exp-name" && exp) focusSelect(`exp-name-${exp.id}`);
  else if (target.type === "mem-name" && mem) focusSelect(`mem-name-${mem.id}`);
  else if (target.type === "add-exp") focusKey("add-exp");
  else if (target.type === "add-mem") focusKey("add-mem");
}

// A cell is one Tab stop (its checkbox): Space ticks, arrows move, Enter opens the
// popover, and typing a digit opens it with "Đã trả" already started.
const ARROWS = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right" };
grid.addEventListener("keydown", (event) => {
  const box = event.target;
  const td = box.type === "checkbox" && box.closest("td.cell");
  if (!td || event.altKey || event.ctrlKey || event.metaKey || event.isComposing) return;
  const { expense, member } = td.dataset;
  if (ARROWS[event.key]) {
    event.preventDefault();
    focusTarget(cellTarget(cellPos(expense, member), ARROWS[event.key]));
  } else if (event.key === "Enter") {
    event.preventDefault();
    openPopover(expense, member);
  } else if (event.key === "a" || event.key === "A") {
    event.preventDefault();
    toggleAll(expense);
  } else if (/^[0-9]$/.test(event.key)) {
    event.preventDefault();
    openPopover(expense, member);
    if (openCell?.expenseId !== expense || openCell?.memberId !== member) return;
    popPaid.value = event.key;
    popPaid.dispatchEvent(new Event("input"));
  }
});

// ---------- popover ----------
const popPaid = $("pop-paid");
const popExtra = $("pop-extra");

function openPopover(expenseId, memberId) {
  if (openCell) {
    closePopover({ restoreFocus: false });
    if (openCell) return; // previous cell still has an invalid field
  }
  openCell = { expenseId, memberId };
  const cell = expenseOf(expenseId).cells[memberId];
  popPaid.value = cell.paid ? cell.paid.toLocaleString("vi-VN") : "";
  popExtra.value = cell.extra ? cell.extra.toLocaleString("vi-VN") : "";
  popPaid.classList.remove("invalid");
  popExtra.classList.remove("invalid");
  popover.hidden = false;
  render();
  popPaid.focus();
  popPaid.select();
}

/** Title + mời riêng list; rebuilt on every render so it never goes stale. Money inputs are left alone. */
function refreshPopoverBody() {
  const { expenseId, memberId } = openCell;
  const cell = expenseOf(expenseId).cells[memberId];
  $("pop-title").textContent = `${nameOf(memberId)} · ${expenseOf(expenseId).name}`;
  const others = trip.members.filter((m) => m.id !== memberId);
  if (!others.length) {
    $("pop-treats").textContent = "Cần ít nhất 2 người.";
    return;
  }
  $("pop-treats").replaceChildren(...others.map((m) =>
    el("label", {},
      el("input", {
        type: "checkbox", value: m.id, checked: cell.treats.includes(m.id), dataset: { key: `treat-${m.id}` },
        onchange: () => {
          const treats = [...$("pop-treats").querySelectorAll("input:checked")].map((i) => i.value);
          update((t) => setCell(t, expenseId, memberId, { treats }));
        },
      }), m.name)));
}

/**
 * Closes without re-rendering the grid (a render here would swallow the click that
 * caused the close). Refuses while a money field is invalid, unless forced.
 */
function closePopover({ restoreFocus = true, force = false } = {}) {
  if (!openCell) return;
  const invalid = [popPaid, popExtra].find((i) => i.classList.contains("invalid"));
  if (invalid && !force) {
    invalid.focus();
    invalid.select();
    return;
  }
  const key = `on-${openCell.expenseId}-${openCell.memberId}`;
  openCell = null;
  popover.hidden = true;
  grid.querySelector("td.cell.open")?.classList.remove("open");
  if (restoreFocus) grid.querySelector(`[data-key="${CSS.escape(key)}"]`)?.focus();
}

function openTd() {
  return openCell && grid.querySelector(
    `td[data-expense="${CSS.escape(openCell.expenseId)}"][data-member="${CSS.escape(openCell.memberId)}"]`);
}

function positionPopover() {
  const td = openTd();
  if (!td) {
    // The open cell was removed (delete / undo): close and keep focus inside the grid.
    closePopover({ restoreFocus: false, force: true });
    $("grid-wrap").focus();
    return;
  }
  if (window.innerWidth < 640) {
    popover.classList.add("sheet");
    popover.style.left = popover.style.top = "";
    // Lift the bottom sheet above the on-screen keyboard (iOS keeps fixed elements behind it).
    const vv = window.visualViewport;
    const covered = vv ? Math.max(0, window.innerHeight - vv.height - vv.offsetTop) : 0;
    popover.style.bottom = `${covered}px`;
    return;
  }
  popover.classList.remove("sheet");
  popover.style.bottom = "";
  const r = td.getBoundingClientRect();
  const { offsetWidth: width, offsetHeight: height } = popover;
  const viewportWidth = document.documentElement.clientWidth;
  const left = Math.min(Math.max(8, r.left), viewportWidth - width - 8) + window.scrollX;
  const fitsBelow = r.bottom + 6 + height <= window.innerHeight || r.top - 6 - height < 0;
  const top = (fitsBelow ? r.bottom + 6 : r.top - 6 - height) + window.scrollY;
  popover.style.left = `${left}px`;
  popover.style.top = `${top}px`;
}

for (const [input, field] of [[popPaid, "paid"], [popExtra, "extra"]]) {
  input.addEventListener("input", () => {
    const value = parseAmount(input.value);
    input.classList.toggle("invalid", value === null);
    if (value === null || !openCell) return;
    const { expenseId, memberId } = openCell;
    update((t) => setCell(t, expenseId, memberId, { [field]: value }));
  });
}

/** Enter in the popover saves and moves down the column (Shift+Enter: up). */
function commitAndMove(move) {
  const { expenseId, memberId } = openCell;
  closePopover({ restoreFocus: false });
  if (openCell) return; // a money field is invalid; closePopover focused it
  focusTarget(cellTarget(cellPos(expenseId, memberId), move));
}

popover.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && event.target.tagName === "INPUT" && !event.isComposing) {
    event.preventDefault();
    commitAndMove(event.shiftKey ? "prev" : "next");
  } else if (event.key === "Tab") {
    // Keep Tab inside the popover; Enter / Esc are the ways out.
    const stops = [...popover.querySelectorAll("input, button")].filter((n) => n.tabIndex >= 0 && !n.disabled);
    const edge = event.shiftKey ? stops[0] : stops.at(-1);
    if (event.target === edge) {
      event.preventDefault();
      (event.shiftKey ? stops.at(-1) : stops[0]).focus();
    }
  }
});
$("pop-done").addEventListener("click", () => closePopover());
$("pop-close").addEventListener("click", () => closePopover());
document.addEventListener("keydown", (event) => { if (event.key === "Escape") closePopover(); });
document.addEventListener("pointerdown", (event) => {
  if (openCell && !popover.contains(event.target) && !event.target.closest("td.cell")) {
    closePopover({ restoreFocus: false });
  }
});
const reposition = () => { if (openCell) positionPopover(); };
window.addEventListener("resize", reposition);
window.addEventListener("scroll", reposition, { passive: true });
$("grid-wrap").addEventListener("scroll", reposition, { passive: true });
window.visualViewport?.addEventListener("resize", reposition);
window.visualViewport?.addEventListener("scroll", reposition);

// ---------- top bar ----------
const tripName = $("trip-name");
tripName.value = trip.name;
tripName.addEventListener("input", () => {
  trip = { ...trip, name: tripName.value };
  undo = null;
  save();
  renderUndo();
  renderSettlement(calculate(trip.members, trip.expenses));
});
tripName.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" || event.isComposing) return;
  event.preventDefault();
  if (trip.members.length) focusTarget({ type: "mem-name", mi: 0 });
  else onAddMember();
});
$("reset").addEventListener("click", () => {
  if (!trip.members.length && !trip.expenses.length && !trip.name) return;
  closePopover({ restoreFocus: false, force: true });
  update(() => emptyTrip(), "Đã bắt đầu buổi mới.");
  tripName.value = "";
});
$("undo-bar").addEventListener("click", () => { tripName.value = trip.name; });
$("copy").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(summary);
    $("copy-status").textContent = "Đã sao chép kết quả.";
  } catch {
    $("copy-fallback").hidden = false;
    $("summary-text").focus();
    $("summary-text").select();
    $("copy-status").textContent = "Hãy sao chép phần văn bản đã chọn.";
  }
});

// ---------- export ----------
/**
 * Starts an export: gives the trip its invoice code on the first export (CTN-YYMMDD-NN, daily counter kept
 * in this browser) and keeps it for every later export. Returns the report and the export time.
 */
function prepareExport() {
  const now = new Date();
  if (!trip.invoice) {
    let prev = null;
    try { prev = JSON.parse(localStorage.getItem(SEQ_KEY) ?? "null"); } catch { /* no counter yet */ }
    const seq = nextSeq(prev, now);
    try { localStorage.setItem(SEQ_KEY, JSON.stringify(seq)); } catch { /* counter not saved: next trip may reuse the number */ }
    trip = setInvoice(trip, { code: invoiceCode(now, seq.n), issuedAt: now.toISOString() });
    save();
  }
  return { now, report: buildReport(trip, now) };
}

function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const link = el("a", { href: url, download: name, hidden: true });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

$("excel").addEventListener("click", () => {
  const { now, report } = prepareExport();
  const type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  downloadBlob(new Blob([buildXlsx(reportSheets(report, paymentView(payment, report)))], { type }), fileName(report.number, report.title, now, "xlsx"));
  $("copy-status").textContent = "Đã tạo file Excel.";
});

$("invoice").addEventListener("click", async () => {
  const { now, report } = prepareExport();
  const images = new Map();
  for (const [id, blob] of await evidenceBlobs(report)) images.set(id, await blobToDataUrl(blob));
  const html = invoiceHtml(report, paymentView(payment, report), { images });
  downloadBlob(new Blob([html], { type: "text/html;charset=utf-8" }), fileName(report.number, report.title, now, "html"));
  $("copy-status").textContent = "Đã tải hóa đơn HTML. Mở file để xem, hoặc Ctrl+P để in / lưu PDF.";
});

function loadImage(src) {
  return new Promise((resolve) => {
    if (!src) { resolve(null); return; }
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}
let logoPromise = null;
const loadLogo = () => (logoPromise ??= loadImage("./assets/logo.svg"));

// ---------- payment info ----------
let payment = normalizePayment(read(PAYMENT_KEY));
const PAY_FIELDS = { bank: "pay-bank", account: "pay-account", owner: "pay-owner", memo: "pay-memo" };

function savePayment() {
  try {
    localStorage.setItem(PAYMENT_KEY, JSON.stringify(payment));
    return true;
  } catch {
    $("pay-status").textContent = "Không lưu được (bộ nhớ trình duyệt đầy?). Thử ảnh QR nhỏ hơn.";
    return false;
  }
}

function renderPaymentChoices() {
  const select = $("pay-recipient");
  if (document.activeElement !== select) {
    select.replaceChildren(el("option", { value: "" }, "Không ghi"),
      ...trip.members.map((m) => el("option", { value: m.id }, m.name)));
    select.value = trip.members.some((m) => m.id === payment.recipientId) ? payment.recipientId : "";
  }
  const now = new Date();
  $("pay-memo").placeholder = defaultMemo({ title: trip.name?.trim() || "Chia tiền nhóm", date: `${String(now.getDate()).padStart(2, "0")}/${String(now.getMonth() + 1).padStart(2, "0")}` });
}

function renderQr() {
  $("pay-qr-img").hidden = !payment.qr;
  $("pay-qr-empty").hidden = Boolean(payment.qr);
  $("pay-qr-clear").hidden = !payment.qr;
  if (payment.qr) $("pay-qr-img").src = payment.qr;
  else $("pay-qr-img").removeAttribute("src");
}

for (const [field, id] of Object.entries(PAY_FIELDS)) {
  $(id).value = payment[field];
  $(id).addEventListener("input", () => { payment = { ...payment, [field]: $(id).value }; savePayment(); });
}
$("pay-recipient").addEventListener("change", (event) => {
  payment = { ...payment, recipientId: event.target.value };
  savePayment();
});

/** Shrinks the uploaded QR to ≤ 600px PNG so it fits in localStorage. */
async function qrDataUrl(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    if (!img) return null;
    const scale = Math.min(1, 600 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
}

$("pay-qr-file").addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;
  const dataUrl = await qrDataUrl(file);
  if (!dataUrl) {
    $("pay-status").textContent = "Không đọc được ảnh này. Hãy chọn ảnh PNG hoặc JPG.";
    return;
  }
  const previous = payment;
  payment = { ...payment, qr: dataUrl };
  if (!savePayment()) { payment = previous; return; }
  renderQr();
  $("pay-status").textContent = "Đã lưu mã QR.";
});
$("pay-qr-clear").addEventListener("click", () => {
  payment = { ...payment, qr: "" };
  savePayment();
  renderQr();
  $("pay-status").textContent = "Đã xóa mã QR.";
});
renderQr();

const receiptDialog = $("receipt-dialog");
let receiptFile = null;
let receiptUrl = null;

/** Loads the report's chứng từ photos: Map(id → Blob). Missing photos are left out. */
async function evidenceBlobs(report) {
  const blobs = new Map();
  for (const { id } of report.evidence) {
    try {
      const blob = await getPhoto(id);
      if (blob) blobs.set(id, blob);
    } catch { /* IndexedDB unavailable */ }
  }
  return blobs;
}

async function makeReceipt() {
  const { now, report } = prepareExport();
  const withEvidence = report.evidence.length > 0;
  $("receipt-evidence-row").hidden = !withEvidence;
  const includeEvidence = withEvidence && $("receipt-evidence").checked;
  const images = new Map();
  const urls = [];
  if (includeEvidence) {
    for (const [id, blob] of await evidenceBlobs(report)) {
      const url = URL.createObjectURL(blob);
      urls.push(url);
      const img = await loadImage(url);
      if (img) images.set(id, img);
    }
  }
  try { await Promise.all([document.fonts.load("600 16px Lexend"), document.fonts.load("400 14px Lexend")]); } catch { /* system font */ }
  const canvas = drawReceipt(document.createElement("canvas"), report, {
    logo: await loadLogo(), qr: await loadImage(payment.qr), pay: paymentView(payment, report), images, evidence: includeEvidence,
  });
  urls.forEach((u) => URL.revokeObjectURL(u));
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  return { now, report, blob };
}

$("receipt-evidence").addEventListener("change", () => showReceipt());
$("receipt").addEventListener("click", () => {
  closePopover({ restoreFocus: false, force: true });
  showReceipt();
});

async function showReceipt() {
  $("receipt-status").textContent = "Đang tạo ảnh…";
  const { now, report, blob } = await makeReceipt();
  if (!blob) {
    $("copy-status").textContent = "Không tạo được ảnh trên trình duyệt này.";
    $("receipt-status").textContent = "Không tạo được ảnh.";
    return;
  }
  if (receiptUrl) URL.revokeObjectURL(receiptUrl);
  receiptUrl = URL.createObjectURL(blob);
  receiptFile = new File([blob], fileName(report.number, report.title, now, "png"), { type: "image/png" });
  $("receipt-img").src = receiptUrl;
  $("receipt-download").href = receiptUrl;
  $("receipt-download").download = receiptFile.name;
  $("receipt-share").hidden = !navigator.canShare?.({ files: [receiptFile] });
  $("receipt-copy").hidden = !(window.ClipboardItem && navigator.clipboard?.write);
  $("receipt-status").textContent = "";
  if (!receiptDialog.open) receiptDialog.showModal();
}

// ---------- chứng từ: one photo list for the whole trip ----------
// Object URLs for stored photos; revoked when a photo is deleted.
const photoUrls = new Map();
const loadingPhotos = new Set();
function photoUrl(id) {
  if (photoUrls.has(id)) return photoUrls.get(id);
  if (!loadingPhotos.has(id)) {
    loadingPhotos.add(id);
    getPhoto(id).then((blob) => { photoUrls.set(id, blob ? URL.createObjectURL(blob) : ""); })
      .catch(() => photoUrls.set(id, ""))
      .finally(() => { loadingPhotos.delete(id); renderEvidencePanel(); });
  }
  return null; // still loading
}
const evidenceStatus = (msg) => { $("evidence-panel-status").textContent = msg; };

async function addEvidenceFiles(files) {
  const added = [];
  for (const [k, file] of files.entries()) {
    evidenceStatus(`Đang lưu ảnh ${k + 1}/${files.length}…`);
    try {
      const id = crypto.randomUUID();
      await putPhoto(id, await compressPhoto(file));
      added.push(id);
    } catch {
      evidenceStatus(`Không lưu được "${file.name}".`);
    }
  }
  if (added.length) {
    update((t) => setEvidence(t, [...(t.evidence ?? []), ...added]));
    evidenceStatus(`Đã thêm ${added.length} ảnh.`);
  }
}

async function removeEvidence(id) {
  update((t) => setEvidence(t, (t.evidence ?? []).filter((x) => x !== id)));
  try { await deletePhoto(id); } catch { /* already gone */ }
  if (photoUrls.get(id)) URL.revokeObjectURL(photoUrls.get(id));
  photoUrls.delete(id);
  evidenceStatus("Đã xóa ảnh.");
}

/** "Chứng từ thanh toán": thumbnails CT1, CT2… (click = open large, ✕ = delete). */
function renderEvidencePanel() {
  const ids = trip.evidence ?? [];
  $("evidence-count").textContent = ids.length ? `${ids.length} ảnh` : "";
  $("evidence-panel").replaceChildren(...ids.map((id, k) => {
    const url = photoUrl(id);
    const code = `CT${k + 1}`;
    return el("figure", {},
      url ? el("a", { href: url, target: "_blank", rel: "noopener", title: "Mở ảnh lớn" }, el("img", { src: url, alt: `Chứng từ ${code}` }))
        : el("p", { class: "muted ev-missing" }, url === "" ? "Ảnh không còn trong trình duyệt này." : "Đang tải…"),
      el("figcaption", {}, code, el("button", {
        type: "button", class: "icon", "aria-label": `Xóa ảnh ${code}`, onclick: () => removeEvidence(id),
      }, "✕")));
  }));
}

$("evidence-file").addEventListener("change", (event) => {
  const files = [...(event.target.files ?? [])];
  event.target.value = "";
  if (files.length) addEvidenceFiles(files);
});

// Photos no longer in the trip (deleted, or "Buổi mới") are removed on the next visit.
// Deferred to page load so "Hoàn tác" within this visit still finds them.
(async () => {
  try {
    const used = new Set(trip.evidence ?? []);
    for (const id of await photoIds()) if (!used.has(id)) await deletePhoto(id);
  } catch { /* IndexedDB unavailable */ }
})();

$("receipt-copy").addEventListener("click", async () => {
  try {
    await navigator.clipboard.write([new ClipboardItem({ "image/png": receiptFile })]);
    $("receipt-status").textContent = "Đã sao chép ảnh. Dán (Ctrl+V) vào nhóm chat.";
  } catch {
    $("receipt-status").textContent = "Trình duyệt không cho sao chép ảnh. Hãy bấm Tải ảnh.";
  }
});
$("receipt-share").addEventListener("click", async () => {
  try {
    await navigator.share({ files: [receiptFile], title: "Hóa đơn chia tiền" });
  } catch (error) {
    if (error?.name !== "AbortError") $("receipt-status").textContent = "Không chia sẻ được. Hãy bấm Tải ảnh.";
  }
});
$("receipt-close").addEventListener("click", () => receiptDialog.close());
receiptDialog.addEventListener("click", (event) => { if (event.target === receiptDialog) receiptDialog.close(); });

render();

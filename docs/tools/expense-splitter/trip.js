// Trip data and immutable operations. Every function returns a new trip.

const newId = () => globalThis.crypto.randomUUID();
const WARNING = "Không thể đọc buổi đã lưu trên trình duyệt này.";

// evidence: chứng từ photo ids for the whole trip (photos live in IndexedDB), in upload order.
// invoice: { code: "CTN-YYMMDD-NN", issuedAt: ISO string } — assigned once, on the first export (see naming.js).
export const emptyTrip = () => ({ name: "", members: [], expenses: [], evidence: [], invoice: null });

const blankCell = (on) => ({ on, paid: 0, extra: 0, treats: [] });

const mapExpenses = (trip, fn) => ({ ...trip, expenses: trip.expenses.map(fn) });

export function addMember(trip, name) {
  const id = newId();
  return {
    ...mapExpenses(trip, (e) => ({ ...e, cells: { ...e.cells, [id]: blankCell(false) } })),
    members: [...trip.members, { id, name }],
  };
}

export function renameMember(trip, id, name) {
  return { ...trip, members: trip.members.map((m) => (m.id === id ? { ...m, name } : m)) };
}

export function removeMember(trip, id) {
  const next = mapExpenses(trip, (e) => {
    const cells = {};
    for (const [memberId, cell] of Object.entries(e.cells)) {
      if (memberId === id) continue;
      cells[memberId] = { ...cell, treats: cell.treats.filter((t) => t !== id) };
    }
    return { ...e, cells };
  });
  return { ...next, members: trip.members.filter((m) => m.id !== id) };
}

export function addExpense(trip, name) {
  const cells = Object.fromEntries(trip.members.map(({ id }) => [id, blankCell(true)]));
  return { ...trip, expenses: [...trip.expenses, { id: newId(), name, cells }] };
}

export function renameExpense(trip, id, name) {
  return mapExpenses(trip, (e) => (e.id === id ? { ...e, name } : e));
}

export function removeExpense(trip, id) {
  return { ...trip, expenses: trip.expenses.filter((e) => e.id !== id) };
}

export function setCell(trip, expenseId, memberId, patch) {
  if (!trip.members.some(({ id }) => id === memberId)) return trip;
  return mapExpenses(trip, (e) => {
    if (e.id !== expenseId) return e;
    const current = Object.hasOwn(e.cells, memberId) ? e.cells[memberId] : blankCell(false);
    const cell = { ...current, ...patch };
    if (patch.treats) {
      const known = new Set(trip.members.map(({ id }) => id));
      cell.treats = [...new Set(patch.treats)].filter((t) => t !== memberId && known.has(t));
    }
    return { ...e, cells: { ...e.cells, [memberId]: cell } };
  });
}

/** Replaces the trip's chứng từ photo ids (deduped, strings only, order kept). */
export function setEvidence(trip, ids) {
  return { ...trip, evidence: [...new Set(ids.filter((id) => typeof id === "string"))] };
}

/** Sets the trip's invoice identity (code + issue time). */
export function setInvoice(trip, invoice) {
  return { ...trip, invoice: readInvoice(invoice) };
}

/** First unused "<prefix> N" among the items' names. */
export function nextName(prefix, items) {
  const used = new Set(items.map(({ name }) => name));
  let n = 1;
  while (used.has(`${prefix} ${n}`)) n += 1;
  return `${prefix} ${n}`;
}

// ---- Loading saved data ----

const isText = (v) => typeof v === "string";
const isAmount = (v) => Number.isSafeInteger(v) && v >= 0;

const uniqueSafeIds = (items) => {
  const ids = items.map(({ id }) => id);
  return new Set(ids).size === ids.length && !ids.includes("__proto__");
};

function validMembers(members) {
  return Array.isArray(members) && members.every((m) => m && isText(m.id) && isText(m.name)) &&
    uniqueSafeIds(members);
}

const INVOICE_CODE = /^CTN-\d{6}-\d{2,}$/;

/** { code, issuedAt } when both are well-formed, else null. */
function readInvoice(value) {
  if (!value || !isText(value.code) || !INVOICE_CODE.test(value.code)) return null;
  if (!isText(value.issuedAt) || Number.isNaN(Date.parse(value.issuedAt))) return null;
  return { code: value.code, issuedAt: value.issuedAt };
}

function readV2(data) {
  if (!data || !isText(data.name) || !validMembers(data.members) || !Array.isArray(data.expenses)) return null;
  const ids = new Set(data.members.map(({ id }) => id));
  const expenses = [];
  const evidence = Array.isArray(data.evidence) ? data.evidence.filter(isText) : [];
  for (const e of data.expenses) {
    if (!e || !isText(e.id) || !isText(e.name) || !e.cells || typeof e.cells !== "object") return null;
    const cells = {};
    for (const id of ids) {
      const c = Object.hasOwn(e.cells, id) && e.cells[id] ? e.cells[id] : blankCell(false);
      if (typeof c.on !== "boolean" || !isAmount(c.paid) || !isAmount(c.extra) ||
          !Array.isArray(c.treats) || !c.treats.every(isText)) return null;
      cells[id] = { on: c.on, paid: c.paid, extra: c.extra, treats: c.treats.filter((t) => ids.has(t)) };
    }
    // Older saves kept photos per expense: fold them into the trip-level list.
    if (Array.isArray(e.evidence)) evidence.push(...e.evidence.filter(isText));
    expenses.push({ id: e.id, name: e.name, cells });
  }
  if (!uniqueSafeIds(expenses)) return null;
  return {
    name: data.name, members: data.members.map(({ id, name }) => ({ id, name })), expenses,
    evidence: [...new Set(evidence)].slice(0, 100),
    invoice: readInvoice(data.invoice),
  };
}

function readV1(data) {
  if (!data || !isText(data.name) || !validMembers(data.members) || !Array.isArray(data.expenses)) return null;
  const ids = data.members.map(({ id }) => id);
  const expenses = [];
  for (const e of data.expenses) {
    if (!e || !isText(e.id) || !isText(e.name) || !Number.isSafeInteger(e.amount) || e.amount <= 0 ||
        !ids.includes(e.payer) || !Array.isArray(e.participants)) return null;
    const cells = Object.fromEntries(ids.map((id) => [id, {
      on: e.participants.includes(id), paid: id === e.payer ? e.amount : 0, extra: 0, treats: [],
    }]));
    expenses.push({ id: e.id, name: e.name, cells });
  }
  return { name: data.name, members: data.members.map(({ id, name }) => ({ id, name })), expenses, evidence: [], invoice: null };
}

/** Reads saved JSON: v2 first, else migrates v1. Corrupt data → empty trip + warning. */
export function loadTrip(v2Json, v1Json) {
  const raw = v2Json ?? v1Json;
  if (raw == null) return { trip: emptyTrip(), warning: null };
  try {
    const trip = v2Json != null ? readV2(JSON.parse(v2Json)) : readV1(JSON.parse(v1Json));
    if (trip) return { trip, warning: null };
  } catch {
    // fall through
  }
  return { trip: emptyTrip(), warning: WARNING };
}

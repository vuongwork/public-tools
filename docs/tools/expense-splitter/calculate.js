const emptyCell = { on: false, paid: 0, extra: 0, treats: [] };

function readCell(expense, id) {
  const cells = expense.cells ?? {};
  return { ...emptyCell, ...(Object.hasOwn(cells, id) ? cells[id] : {}) };
}

/**
 * Splits one expense. Returns per-member paid/share, or an error (Vietnamese) when inputs conflict.
 * Order: total = Σpaid; extras (phần riêng: món riêng, tiền mời) come off first; the rest is split equally
 * among ticked members (spare đồng go to the earliest members); mời riêng moves the
 * treated person's equal share onto the treater.
 */
export function calculateExpense(members, expense) {
  const cells = new Map(members.map(({ id }) => [id, readCell(expense, id)]));
  const nameOf = new Map(members.map(({ id, name }) => [id, name]));
  const paid = {};
  const share = {};
  let total = 0;
  let extras = 0;
  for (const { id } of members) {
    const { paid: p, extra } = cells.get(id);
    paid[id] = p;
    share[id] = 0;
    total += p;
    extras += extra;
  }
  const fail = (error) => ({ total, paid, share, error });
  if (!Number.isSafeInteger(total) || !Number.isSafeInteger(extras)) return fail("Số tiền vượt giới hạn.");
  if (extras > total) return fail("Tổng phần riêng lớn hơn tổng khoản.");

  const pool = total - extras;
  const ticked = members.filter(({ id }) => cells.get(id).on).map(({ id }) => id);
  if (pool > 0 && ticked.length === 0) return fail("Chưa ai được tick để chia phần còn lại.");

  const equal = Object.fromEntries(members.map(({ id }) => [id, 0]));
  if (ticked.length) {
    const base = Math.floor(pool / ticked.length);
    let remainder = pool % ticked.length;
    for (const id of ticked) {
      equal[id] = base + (remainder > 0 ? 1 : 0);
      if (remainder > 0) remainder -= 1;
    }
  }

  // Collect valid treat pairs first, then validate, then move shares.
  const pairs = [];
  for (const { id } of members) {
    const treats = cells.get(id).treats.filter((other) => other !== id && cells.has(other));
    for (const other of treats) pairs.push([id, other]);
  }
  const treaters = new Set(pairs.map(([from]) => from));
  const treatedBy = new Map();
  for (const [from, to] of pairs) {
    if (!cells.get(from).on) return fail(`${nameOf.get(from)} mời riêng nhưng chưa tick.`);
    if (!cells.get(to).on) return fail(`${nameOf.get(to)} được mời nhưng chưa tick.`);
    if (treatedBy.has(to) && treatedBy.get(to) !== from) return fail(`${nameOf.get(to)} được hai người mời.`);
    treatedBy.set(to, from);
  }
  for (const to of treatedBy.keys()) {
    if (treaters.has(to)) return fail(`${nameOf.get(to)} vừa được mời vừa mời người khác.`);
  }
  for (const [to, from] of treatedBy) {
    equal[from] += equal[to];
    equal[to] = 0;
  }

  for (const { id } of members) share[id] = equal[id] + cells.get(id).extra;
  return { total, paid, share, error: null };
}

/** Greedy debtor→creditor matching in member order. */
export function settle(balances) {
  const debtors = balances.filter(({ net }) => net < 0).map(({ id, net }) => ({ id, left: -net }));
  const creditors = balances.filter(({ net }) => net > 0).map(({ id, net }) => ({ id, left: net }));
  const transfers = [];
  let d = 0;
  let c = 0;
  while (d < debtors.length && c < creditors.length) {
    const amount = Math.min(debtors[d].left, creditors[c].left);
    transfers.push({ from: debtors[d].id, to: creditors[c].id, amount });
    debtors[d].left -= amount;
    creditors[c].left -= amount;
    if (debtors[d].left === 0) d += 1;
    if (creditors[c].left === 0) c += 1;
  }
  return transfers;
}

export function calculate(members, expenses) {
  const balances = members.map(({ id, name }) => ({ id, name, paid: 0, share: 0, net: 0 }));
  const errors = {};
  let total = 0;
  for (const expense of expenses) {
    const result = calculateExpense(members, expense);
    if (result.error) {
      errors[expense.id] = result.error;
      continue;
    }
    total += result.total;
    for (const person of balances) {
      person.paid += result.paid[person.id];
      person.share += result.share[person.id];
    }
  }
  for (const person of balances) person.net = person.paid - person.share;
  return { total, balances, transfers: settle(balances), errors };
}

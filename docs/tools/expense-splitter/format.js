const currency = new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" });
const plain = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 });

const GROUPED = /^(?:\d+|\d{1,3}(?:\.\d{3})+|\d{1,3}(?:,\d{3})+|\d{1,3}(?: \d{3})+)$/u;
// Whole part may be grouped ("1.200k" = 1.200 nghìn); a fraction has at most 2 digits ("1,25tr").
const SUFFIXED = /^(\d{1,3}(?:[.,]\d{3})+|\d+)(?:[.,](\d{1,2}))?\s*(k|tr)$/iu;
const TR_SHORT = /^(\d+)\s*tr\s*(\d{1,2})$/iu;
const UNIT ={ k: 1_000, tr: 1_000_000 };

/** "300.000", "500k", "1,5tr" → integer đồng. Empty → 0. Invalid → null. */
export function parseAmount(text) {
  const raw = String(text ?? "").trim();
  if (raw === "") return 0;
  const input = raw.replace(/\s*[đ₫]$/iu, "");
  if (input === "") return null;
  let amount;
  const suffixed = SUFFIXED.exec(input);
  const trShort = TR_SHORT.exec(input);
  if (trShort) {
    // "1tr5" = 1,5tr
    const [, whole, fraction] = trShort;
    amount = Number(whole) * 1_000_000 + Number(fraction) * (1_000_000 / 10 ** fraction.length);
  } else if (suffixed) {
    const [, whole, fraction = "", unit] = suffixed;
    const scale = UNIT[unit.toLowerCase()];
    const fractionValue = fraction ? Number(fraction) * (scale / 10 ** fraction.length) : 0;
    amount = Number(whole.replace(/[.,]/g, "")) * scale + fractionValue;
  } else if (GROUPED.test(input)) {
    amount = Number(input.replace(/[., ]/g, ""));
  } else {
    return null;
  }
  return Number.isSafeInteger(amount) && amount >= 0 ? amount : null;
}

export const money = (n) => currency.format(n);

/** Compact label for grid cells: 2tr, 1,5tr, 500k, 1.234 */
export function shortMoney(n) {
  if (n >= 1_000_000 && n % 10_000 === 0) return `${plain.format(n / 1_000_000)}tr`;
  if (n >= 1_000 && n % 1_000 === 0) return `${plain.format(n / 1_000)}k`;
  return plain.format(n);
}

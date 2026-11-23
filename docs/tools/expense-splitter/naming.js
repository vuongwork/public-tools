// Naming rules for invoices and exported files. Pure functions; all times are the device's local time.
//
//   Mã hóa đơn   CTN-YYMMDD-NN          ngày lập + số thứ tự trong ngày (01, 02 … 99, 100 …).
//                                        Cấp một lần cho mỗi buổi, xuất lại vẫn giữ nguyên.
//   Timestamp    YYYYMMDD-HHmmss         trong tên file; hiển thị DD/MM/YYYY HH:mm:ss.
//   Tên file     {mã}_{slug}_{timestamp}.{đuôi}
//                CTN-261123-01_di-bien-cuoi-tuan_20261123-172045.xlsx

export const INVOICE_PREFIX = "CTN";
export const SEQ_KEY = "public-tools:expense-splitter:invoice-seq";

const pad = (n, width = 2) => String(n).padStart(width, "0");

/** "YYMMDD" of a date, used inside the invoice code and as the daily-counter key. */
export const dayKey = (date) => `${pad(date.getFullYear() % 100)}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;

/** CTN-261123-01 */
export const invoiceCode = (date, seq) => `${INVOICE_PREFIX}-${dayKey(date)}-${pad(seq)}`;

/** Next daily counter: prev is { d: "YYMMDD", n } or null. A new day restarts at 1. */
export function nextSeq(prev, date) {
  const d = dayKey(date);
  return prev && prev.d === d && Number.isSafeInteger(prev.n) && prev.n >= 0 ? { d, n: prev.n + 1 } : { d, n: 1 };
}

/** 20261123-172045 — for file names (sortable, no characters that are illegal in paths). */
export const fileStamp = (date) =>
  `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;

/** { date: "23/11/2026", time: "17:20:45" } for display. */
export const displayStamp = (date) => ({
  date: `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`,
  time: `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`,
});

/** "Đi biển cuối tuần" → "di-bien-cuoi-tuan" (≤ 40 chars, never empty). */
export function slugify(title) {
  const slug = String(title ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[đĐ]/g, "d")
    .replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase().slice(0, 40).replace(/-+$/g, "");
  return slug || "chia-tien";
}

/** CTN-261123-01_di-bien-cuoi-tuan_20261123-172045.png */
export const fileName = (code, title, date, ext) => `${code}_${slugify(title)}_${fileStamp(date)}.${ext}`;

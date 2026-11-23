// "Thông tin nhận tiền": stored apart from the trip so it survives "Buổi mới".

export const PAYMENT_KEY = "public-tools:expense-splitter:payment";
const QR_DATA_URL = /^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/;

export const emptyPayment = () => ({ recipientId: "", bank: "", account: "", owner: "", memo: "", qr: "" });

/** Accepts a JSON string or object; anything malformed is dropped field by field. */
export function normalizePayment(raw) {
  let p = raw;
  if (typeof raw === "string") {
    try { p = JSON.parse(raw); } catch { p = null; }
  }
  if (!p || typeof p !== "object") return emptyPayment();
  const str = (v, max) => (typeof v === "string" ? v.slice(0, max) : "");
  return {
    recipientId: str(p.recipientId, 64),
    bank: str(p.bank, 60),
    account: str(p.account, 40),
    owner: str(p.owner, 80),
    memo: str(p.memo, 120),
    qr: typeof p.qr === "string" && QR_DATA_URL.test(p.qr) ? p.qr : "",
  };
}

export const hasPayment = (p) => Boolean(p.bank || p.account || p.owner || p.qr);

const plain = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[đĐ]/g, "D");

/** "Đi biển cuối tuần", 23/11/2026 → "CTN DIBIEN 2311 + tên bạn" */
export function defaultMemo(report) {
  const words = plain(report.title).toUpperCase().replace(/[^A-Z0-9 ]+/g, " ").split(/\s+/).filter(Boolean);
  const tag = words.slice(0, 2).join("").slice(0, 12);
  const ddmm = report.date.slice(0, 5).replace("/", "");
  return `CTN ${tag ? `${tag} ` : ""}${ddmm} + tên bạn`;
}

/** What exports print: memo defaults, recipient id resolved to a current member name. */
export function paymentView(payment, report) {
  const p = normalizePayment(payment);
  return {
    ...p,
    recipientName: report.members.find((m) => m.id === p.recipientId)?.name ?? "",
    memo: p.memo.trim() || defaultMemo(report),
    show: hasPayment(p),
  };
}

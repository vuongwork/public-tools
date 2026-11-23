// HTML invoice built from hoa-don-template.html (A4). Pure: returns a standalone HTML string.
import { cellTags } from "./report.js";

const num = new Intl.NumberFormat("vi-VN");
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const m = (v) => `${num.format(v)} <span class="d">₫</span>`;

const LOGO_PATHS = '<path fill="#0b6f73" d="M48 10 A40 40 0 0 0 48 90 Z"/><path fill="#c9862f" d="M52 10 A40 40 0 0 1 52 90 Z"/>'
  + '<g transform="translate(50 50) scale(0.56) translate(-50 -51)"><path fill="#e6f3f1" d="M4 12 L45 34 L37 39 L48 61 L48 90 Z"/>'
  + '<path fill="#e6f3f1" d="M96 12 L55 34 L63 39 L52 61 L52 90 Z"/></g><rect x="38" y="20" width="24" height="5" rx="1" fill="#e6f3f1"/>';
const TICK = '<svg viewBox="0 0 12 12" class="ck"><rect width="12" height="12" rx="3" fill="#0b6f73"/>'
  + '<path d="M3.2 6.2l1.9 1.9 3.8-4" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

const CSS = `
@page{size:A4;margin:0}
*{box-sizing:border-box;margin:0;padding:0}
html,body{background:#fff}
.pg{width:210mm;min-height:297mm;background:#e6f3f1;font-family:Poppins,sans-serif;color:#0d3a42;display:flex;flex-direction:column;position:relative;overflow:hidden}
.hd{background:linear-gradient(100deg,#0b6f73 0%,#0b8a87 55%,#c9862f 100%);color:#fff;padding:9mm 12mm 8mm;display:flex;align-items:center;gap:4mm;position:relative}
.hd .logo{width:15mm;height:15mm;flex:none}
.hd h1{font-size:20pt;font-weight:700;letter-spacing:.2px;line-height:1.1}
.hd .sub{font-size:8.5pt;color:#e3f3f1;margin-top:1mm}
.hd .meta{margin-left:auto;text-align:right;font-size:8pt;line-height:1.6;position:relative;z-index:1}
.hd .meta b{display:inline-block;border:1px solid #fff;border-radius:99px;padding:.4mm 3mm;font-weight:600;font-size:8pt;margin-bottom:1mm}
.bd{padding:7mm 10mm 0;display:flex;flex-direction:column;gap:5mm;flex:1}
.card{background:#fff;border-radius:4mm;padding:5mm 5mm}
.sum{display:grid;grid-template-columns:1.6fr 1fr 1fr 1.3fr;gap:3mm;align-items:end}
.sum .lb{font-size:7pt;color:#5d7c80;text-transform:uppercase;letter-spacing:.6px}
.sum .v{font-size:11.5pt;font-weight:600;margin-top:.6mm}
.sum .v.big{color:#0b6f73;font-size:15pt;font-weight:700}
table{width:100%;border-collapse:separate;border-spacing:0;font-size:8pt;border:1px solid #d7e8e5;border-radius:2.5mm;overflow:hidden}
th,td{padding:2.7mm 2.2mm;border-bottom:1px solid #e3efed;vertical-align:middle}
th{background:#f1f8f7;text-align:left;font-weight:600}
th.corner{font-size:6.8pt;color:#5d7c80;font-weight:500;width:24mm;white-space:nowrap}
.d{font-family:Inter,sans-serif;font-weight:inherit}
th.it{border-left:1px solid #e3efed}
.in{font-size:8pt} .ia{font-size:7pt;color:#0b6f73;font-weight:500;margin-top:.4mm}
th.sm{font-size:7pt;color:#5d7c80;text-align:right;background:#e9f4f2;font-weight:600}
td.nm{font-weight:600}
td.c{border-left:1px solid #e3efed;white-space:nowrap}
.ck{width:3.4mm;height:3.4mm;vertical-align:middle}
.no{display:inline-block;width:3.4mm;height:3.4mm;border:1px solid #b9cfcc;border-radius:.9mm;vertical-align:middle}
.pay{display:inline-block;margin-left:1.4mm;background:#d4efe9;color:#0b6f73;font-size:6.4pt;font-weight:600;padding:.3mm 1.6mm;border-radius:99px;vertical-align:middle}
.pay.ex{background:#fbead2;color:#8a5310}
.pay.tr{background:#e9e8fa;color:#4b4aa8}
td.r{text-align:right;background:#f7fbfa;white-space:nowrap}
td.pt{color:#c9862f;font-weight:700;font-size:8.6pt;width:30mm}
td.neg{color:#c9862f;font-weight:700} td.pos{color:#0b6f73;font-weight:700}
tfoot td{background:#e9f4f2!important;border-bottom:0;font-weight:700}
tfoot td.c{border-left:1px solid #dcebe8}
th.err,td.err{background:#fdf0ed} .ia.err{color:#c2412d;white-space:normal} tfoot td.err s{color:#7d9a9d}
.lg{display:flex;flex-wrap:wrap;gap:1mm 4mm;font-size:6.8pt;color:#5d7c80;margin-top:2.5mm}
.lg .p{color:#0b6f73;font-weight:600} .lg .n{color:#c9862f;font-weight:600}
.bot{display:grid;grid-template-columns:1fr 62mm;gap:5mm}
.bot.one{grid-template-columns:1fr}
.ttl{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:3mm}
.ttl h2{font-size:11pt;font-weight:600} .ttl span{color:#0b6f73;font-weight:700;font-size:11pt}
.tr{display:flex;justify-content:space-between;background:#f1f8f7;border-radius:1.8mm;padding:2.5mm 3mm;font-size:8.5pt;margin-bottom:1.6mm}
.tr i{font-style:normal;color:#7d9a9d;margin:0 1mm} .tr b{color:#c9862f;font-weight:700}
.empty{font-size:8.5pt;color:#5d7c80}
.qrc{display:flex;flex-direction:column;align-items:center;text-align:center}
.qrc h2{font-size:11pt;font-weight:600;align-self:stretch;text-align:left;margin-bottom:3mm}
.qrw{background:#fff;border:1.2mm solid #e6f3f1;border-radius:3mm;padding:2.5mm;width:46mm;height:46mm}
.qr{width:100%;height:100%;display:block;object-fit:contain}
.bk{margin-top:3mm;font-size:8pt;line-height:1.55}
.bk .acc{font-size:11pt;font-weight:700;letter-spacing:.6px;color:#0b6f73}
.bk .own{font-weight:600}
.bk .memo{margin-top:1.8mm;display:inline-block;background:#fbf3e7;color:#8a5a1c;border-radius:1.5mm;padding:.8mm 2.4mm;font-size:7.4pt}
.qrc .hint{font-size:6.8pt;color:#5d7c80;margin-top:2mm}
.ft{display:flex;justify-content:space-between;align-items:center;padding:4mm 12mm 6mm;font-size:7pt;color:#6b8a8d}
.ft .br{display:flex;align-items:center;gap:1.6mm;font-weight:600;color:#0d3a42}
.ft .br svg{width:4.2mm;height:4.2mm}
.cut{border-top:1px dashed #b9d3cf;margin:0 10mm}
@media screen{body{background:#cfe0dd;padding:8mm 0}.pg{margin:0 auto;box-shadow:0 10px 40px rgba(13,58,66,.25)}}
@media print{html,body{-webkit-print-color-adjust:exact;print-color-adjust:exact}.pg+.pg{margin-top:0}}
.ia.ev{color:#8a5310;font-weight:600}
.tcap{font-size:7.5pt;color:#5d7c80;margin:0 0 2mm}
.tcap+table{margin-bottom:4mm}
.pg+.pg{break-before:page;margin-top:8mm}
.evx{display:flex;flex-direction:column;gap:4mm}
.evx .eh{display:flex;justify-content:space-between;align-items:baseline;gap:3mm;margin-bottom:1mm}
.evx h3{font-size:10pt;font-weight:600} .evx .eh span{color:#0b6f73;font-weight:700;font-size:10pt;white-space:nowrap}
.evx .ep{font-size:7.6pt;color:#5d7c80;margin-bottom:3mm}
.evg{column-width:78mm;column-gap:3mm}
.evg figure{display:inline-block;width:100%;margin:0 0 3mm;border:1px solid #d7e8e5;border-radius:2.5mm;overflow:hidden;background:#f7fbfa;break-inside:avoid}
.evg img{display:block;width:100%;height:auto;max-height:200mm;object-fit:contain}
.evg figcaption{font-size:7.4pt;font-weight:600;color:#0b6f73;padding:1.5mm 2.5mm}
`;

/**
 * report: buildReport(); pay: paymentView() (or null);
 * images: Map(evidence id → data URL) for the chứng từ page (missing ids are listed without a photo).
 */
export function invoiceHtml(report, pay = null, { images = new Map() } = {}) {
  const exps = report.expenses;
  const headCell = (e) => `<th class="it${e.error ? " err" : ""}"><div class="in">${esc(e.name)}</div>`
    + (e.error ? `<div class="ia err">Lỗi: ${esc(e.error)}</div>` : `<div class="ia">${m(e.total)}</div>`) + "</th>";
  const tickCell = (e, id) => {
    const tags = cellTags(report, e, id).map((t) => `<span class="pay${t.kind === "extra" ? " ex" : t.kind === "treat" ? " tr" : ""}">${esc(t.text)}</span>`).join("");
    return `<td class="c${e.error ? " err" : ""}">${e.cells[id].on ? TICK : '<span class="no"></span>'}${tags}</td>`;
  };
  const sumCells = (b) => `<td class="r pt">${m(b.share)}</td>`;
  const sumHead = '<th class="sm">Phải trả</th>';
  const sumFoot = `<td class="r pt">${m(report.balances.reduce((s, b) => s + b.share, 0))}</td>`;
  const footCell = (e) => `<td class="c${e.error ? " err" : ""}">${e.error ? `<s>${m(e.total)}</s>` : m(e.total)}</td>`;

  // One grid, exactly like the UI; with many expenses the page gets wider instead of splitting.
  const tables = `<table><thead><tr><th class="corner">Người \\ Khoản</th>${exps.map(headCell).join("")}${sumHead}</tr></thead>`
    + `<tbody>${report.balances.map((b) => `<tr><td class="nm">${esc(b.name)}</td>${exps.map((e) => tickCell(e, b.id)).join("")}${sumCells(b)}</tr>`).join("")}</tbody>`
    + `<tfoot><tr><td>Tổng</td>${exps.map(footCell).join("")}${sumFoot}</tr></tfoot></table>`;
  // A4 width fits ~4 expense columns; beyond that widen the page (≈30mm per column).
  const pageW = Math.max(210, 24 + 30 * exps.length + 30 + 32);
  const pageCss = pageW > 210 ? `@page{size:${pageW}mm 297mm}.pg{width:${pageW}mm}` : "";

  const transfers = report.transfers.length
    ? report.transfers.map((t) => `<div class="tr"><span>${esc(t.fromName)} <i>→</i> ${esc(t.toName)}</span><b>${m(t.amount)}</b></div>`).join("")
    : '<p class="empty">Không ai cần chuyển tiền.</p>';
  const skipped = report.skipped.length ? `<p class="empty" style="color:#c2412d;margin-top:2mm">Đang bỏ qua khoản lỗi: ${esc(report.skipped.join(", "))}</p>` : "";

  const qrCard = pay?.show ? `<div class="card qrc"><h2>${pay.qr ? "Quét để chuyển" : "Thông tin chuyển khoản"}${pay.recipientName ? ` cho ${esc(pay.recipientName)}` : ""}</h2>`
    + (pay.qr ? `<div class="qrw"><img class="qr" src="${pay.qr}" alt="Mã QR chuyển khoản"></div>` : "")
    + `<div class="bk">${pay.bank ? `<div>${esc(pay.bank)}</div>` : ""}${pay.account ? `<div class="acc">${esc(pay.account)}</div>` : ""}`
    + `${pay.owner ? `<div class="own">${esc(pay.owner.toUpperCase())}</div>` : ""}<div class="memo">ND: ${esc(pay.memo)}</div></div>`
    + '<div class="hint">Nhập số tiền theo dòng của bạn</div></div>' : "";

  const header = (sub) => `<div class="hd"><svg viewBox="10 10 80 80" class="logo">${LOGO_PATHS}</svg><div style="position:relative;z-index:1"><h1>Chia Tiền Nhóm</h1><div class="sub">${sub}</div></div>
<div class="meta"><b>HĐ #${esc(report.number)}</b><br>Ngày lập: ${report.date} · ${report.time}</div></div>`;
  const footer = `<div class="ft"><span class="br"><svg viewBox="10 10 80 80">${LOGO_PATHS}</svg>VNance · Chia Tiền Nhóm</span><span>Hóa đơn tạo tự động, không có giá trị thuế · Xuất lúc ${report.exported.time} ${report.exported.date} · By @vuongwork</span></div>`;

  const photos = report.evidence;
  const evidencePage = photos.length ? `<div class="pg">${header(`Chứng từ thanh toán · ${esc(report.title)}`)}<div class="bd"><div class="evx">`
    + `<div class="card"><div class="eh"><h3>Chứng từ thanh toán</h3><span>${photos.length} ảnh</span></div>`
    + `<div class="evg">${photos.map((x) => `<figure>${images.get(x.id) ? `<img src="${images.get(x.id)}" alt="Chứng từ ${x.code}">` : ""}<figcaption>📎 ${x.code}${images.get(x.id) ? "" : " · không tải được ảnh"}</figcaption></figure>`).join("")}</div></div>`
    + `</div></div>${footer}</div>` : "";

  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Hóa đơn chia tiền · ${esc(report.title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=Poppins:wght@400;500;600;700&display=swap">
<style>${CSS}${pageCss}</style></head><body><div class="pg">
${header(`Hóa đơn chia tiền · ${esc(report.title)}`)}
<div class="bd">
<div class="card sum">
<div><div class="lb">Tên buổi</div><div class="v">${esc(report.title)}</div></div>
<div><div class="lb">Thành viên</div><div class="v">${report.members.length} người</div></div>
<div><div class="lb">Khoản chi</div><div class="v">${exps.length} khoản</div></div>
<div style="text-align:right"><div class="lb">Tổng chi</div><div class="v big">${m(report.total)}</div></div>
</div>
<div class="card">
${tables}
<div class="lg"><span class="n">Phải trả = phần chia của mỗi người</span><span>Số lẻ đã làm tròn đến đồng; phần dư được cộng cho người đứng đầu danh sách.</span>${report.skipped.length ? "<span>Khoản tô đỏ đang lỗi, chưa được tính.</span>" : ""}${photos.length ? `<span>📎 ${photos.length} ảnh chứng từ ở trang sau.</span>` : ""}</div>
</div>
<div class="bot${qrCard ? "" : " one"}">
<div class="card"><div class="ttl"><h2>Chuyển khoản</h2><span>${m(report.transferTotal)}</span></div>${transfers}${skipped}</div>
${qrCard}
</div></div>
${footer}
</div>${evidencePage}</body></html>`;
}

// Receipt image: the UI grid (people × expenses, ticks + trả / riêng / mời tags, Phải trả, Tổng), on a receipt-style paper with header, transfers,
// payment info and chứng từ photos. The image widens with the number of expenses and
// grows with the number of people; text wraps, nothing is cut.
import { gridModel } from "./report.js";

const num = new Intl.NumberFormat("vi-VN");
const n = (v) => num.format(v);

const PAD = 28;
const MARGIN = 18;
const TOOTH = 8;
const MIN_CONTENT = 460;
const EXP_W = 136;
const SUM_W = 100;
const CELL = 8; // cell padding
const C = {
  bg: "#e6f3f1", paper: "#fffdf8", ink: "#0d3a42", muted: "#55777b", line: "#dcebe9", lineStrong: "#b7d6d3",
  teal: "#0b6f73", due: "#c9862f", pos: "#08807b", neg: "#b45a17", error: "#c2412d", amber: "#8a5310",
  head: "#f1f8f7", wash: "#e9f4f2", off: "#f7faf9", sum: "#fafdfc", errorFill: "#fdf0ed", row: "#f1f8f7",
};
const TAG = {
  paid: { bg: "#d8f0ec", fg: "#07605c" },
  extra: { bg: "#fbead2", fg: "#8a5310" },
  treat: { bg: "#e9e8fa", fg: "#4b4aa8" },
};
const font = (size, weight = 400) => `${weight} ${size}px Lexend, system-ui, sans-serif`;

/** Word wrap; a single word wider than the line is broken by characters. */
export function wrapText(measure, text, max) {
  if (max <= 0 || measure(text) <= max) return [text];
  const lines = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const candidate = line ? `${line} ${word}` : word;
    if (measure(candidate) <= max) { line = candidate; continue; }
    if (line) lines.push(line);
    line = word;
    while (measure(line) > max && line.length > 1) {
      let cut = line.length - 1;
      while (cut > 1 && measure(line.slice(0, cut)) > max) cut -= 1;
      lines.push(line.slice(0, cut));
      line = line.slice(cut);
    }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * Paints the receipt and returns the canvas.
 * logo / qr: loaded HTMLImageElements or null. images: Map(evidence id → HTMLImageElement).
 * pay: paymentView() or null. evidence: include chứng từ photos.
 */
export function drawReceipt(canvas, report, { logo = null, qr = null, pay = null, images = new Map(), evidence = false } = {}) {
  const grid = gridModel(report);
  const probe = canvas.getContext("2d");

  // Column widths: the name column fits the longest name up to a limit (longer names wrap).
  probe.font = font(13, 600);
  const nameW = Math.min(180, Math.max(96, ...grid.rows.map((r) => probe.measureText(r.name).width + CELL * 2 + 2)));
  const tableW = nameW + grid.columns.length * EXP_W + SUM_W;
  const contentW = Math.max(MIN_CONTENT, tableW);
  const W = contentW + PAD * 2;

  const paint = (ctx, draw) => drawAll(ctx, draw, { report, grid, pay, qr, logo, images, evidence, nameW, contentW, W });
  const paperH = paint(probe, false);
  const H = paperH + MARGIN * 2 + TOOTH * 2;
  const outerW = W + MARGIN * 2;
  const scale = Math.max(0.4, Math.min(2, 32000 / H, 32000 / outerW, Math.sqrt(120e6 / (outerW * H))));
  canvas.width = Math.round(outerW * scale);
  canvas.height = Math.round(H * scale);
  const ctx = canvas.getContext("2d");
  ctx.scale(scale, scale);
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, outerW, H);
  drawPaper(ctx, MARGIN, MARGIN + TOOTH, W, paperH);
  ctx.translate(MARGIN, MARGIN + TOOTH);
  paint(ctx, true);
  return canvas;
}

function drawPaper(ctx, x0, y0, w, h) {
  const y1 = y0 + h;
  ctx.save();
  ctx.shadowColor = "rgba(13, 58, 66, .18)";
  ctx.shadowBlur = 14;
  ctx.shadowOffsetY = 4;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  for (let x = x0; x < x0 + w; x += TOOTH * 2) { ctx.lineTo(x + TOOTH, y0 - TOOTH); ctx.lineTo(Math.min(x + TOOTH * 2, x0 + w), y0); }
  ctx.lineTo(x0 + w, y1);
  for (let x = x0 + w; x > x0; x -= TOOTH * 2) { ctx.lineTo(x - TOOTH, y1 + TOOTH); ctx.lineTo(Math.max(x - TOOTH * 2, x0), y1); }
  ctx.closePath();
  ctx.fillStyle = C.paper;
  ctx.fill();
  ctx.restore();
}

/** Lays out and (when draw) paints everything inside the paper, origin at the paper's top-left. Returns the height. */
function drawAll(ctx, draw, { report, grid, pay, qr, logo, images, evidence, nameW, contentW, W }) {
  const left = PAD;
  const cx = W / 2;
  let y = PAD;
  ctx.textBaseline = "middle";

  const text = (str, x, ty, { size = 13, weight = 400, color = C.ink, align = "left", strike = false } = {}) => {
    if (!draw) return;
    ctx.font = font(size, weight);
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.fillText(str, x, ty);
    if (strike) {
      const tw = ctx.measureText(str).width;
      const sx = align === "right" ? x - tw : align === "center" ? x - tw / 2 : x;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(sx, ty); ctx.lineTo(sx + tw, ty); ctx.stroke();
    }
  };
  const wrap = (str, max, size, weight = 400) => {
    ctx.font = font(size, weight);
    return wrapText((s) => ctx.measureText(s).width, str, max);
  };
  const rect = (x, ry, w, h, fill) => { if (draw) { ctx.fillStyle = fill; ctx.fillRect(x, ry, w, h); } };
  const hline = (x1, x2, ly, color = C.line, dash = []) => {
    if (!draw) return;
    ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.setLineDash(dash);
    ctx.beginPath(); ctx.moveTo(x1, Math.round(ly) + 0.5); ctx.lineTo(x2, Math.round(ly) + 0.5); ctx.stroke();
    ctx.setLineDash([]);
  };
  const vline = (lx, y1, y2, color = C.line) => {
    if (!draw) return;
    ctx.strokeStyle = color; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(Math.round(lx) + 0.5, y1); ctx.lineTo(Math.round(lx) + 0.5, y2); ctx.stroke();
  };
  const centered = (str, size, { weight = 400, color = C.ink, lh = size + 7 } = {}) => {
    for (const line of wrap(str, contentW, size, weight)) { text(line, cx, y + lh / 2, { size, weight, color, align: "center" }); y += lh; }
  };
  const dashed = () => { y += 8; hline(left, left + contentW, y, C.lineStrong, [4, 4]); y += 10; };

  // ---------- header ----------
  if (draw) {
    if (logo) ctx.drawImage(logo, cx - 24, y, 48, 48);
    else { ctx.fillStyle = C.teal; ctx.beginPath(); ctx.arc(cx, y + 24, 22, 0, Math.PI * 2); ctx.fill(); }
  }
  y += 56;
  centered("HÓA ĐƠN CHIA TIỀN", 19, { weight: 700, color: C.teal, lh: 30 });
  centered(report.title, 14, { weight: 500 });
  centered(`HĐ #${report.number} · Ngày lập ${report.date} ${report.time}`, 12, { color: C.muted });
  centered(`${report.members.length} người · ${report.expenses.length} khoản`, 12, { color: C.muted });
  y += 4;
  centered(`Tổng chi ${n(report.total)} ₫`, 16, { weight: 700, color: C.teal, lh: 26 });
  dashed();

  // ---------- grid (same as the UI) ----------
  const x = { name: left };
  const expX = (i) => left + nameW + i * EXP_W;
  const sumX = (k) => left + nameW + grid.columns.length * EXP_W + k * SUM_W;
  const tableW = nameW + grid.columns.length * EXP_W + SUM_W;
  const tableTop = y;
  const boxes = []; // vertical rule positions
  for (let i = 0; i <= grid.columns.length; i++) boxes.push(expX(i));

  // Header row
  const headCells = grid.columns.map((col) => {
    const lines = [];
    for (const l of wrap(col.name, EXP_W - CELL * 2, 12.5, 600)) lines.push({ t: l, size: 12.5, weight: 600, color: C.ink, lh: 17 });
    if (col.error) for (const l of wrap(`Lỗi: ${col.error}`, EXP_W - CELL * 2, 11, 500)) lines.push({ t: l, size: 11, weight: 500, color: C.error, lh: 15 });
    else lines.push({ t: `${n(col.total)} ₫`, size: 12, weight: 600, color: C.teal, lh: 17 });
    return lines;
  });
  const headH = Math.max(34, ...headCells.map((ls) => ls.reduce((s, l) => s + l.lh, 0))) + CELL * 2;
  rect(left, y, tableW, headH, C.head);
  grid.columns.forEach((col, i) => { if (col.error) rect(expX(i), y, EXP_W, headH, C.errorFill); });
  text("Người \\ Khoản", x.name + CELL, y + CELL + 8, { size: 10.5, weight: 500, color: C.muted });
  headCells.forEach((lines, i) => {
    let ly = y + CELL;
    for (const l of lines) { text(l.t, expX(i) + CELL, ly + l.lh / 2, l); ly += l.lh; }
  });
  text("Phải trả", sumX(1) - CELL, y + CELL + 8, { size: 11.5, weight: 600, color: C.muted, align: "right" });
  y += headH;
  hline(left, left + tableW, y, C.lineStrong);

  // Person rows
  const BOX = 16;
  const tagX = BOX + 6;
  const tagMax = EXP_W - CELL * 2 - tagX;
  for (const row of grid.rows) {
    const nameLines = wrap(row.name, nameW - CELL * 2, 13, 600);
    const cellTags = row.cells.map((c) => c.tags.map((tag) => ({ ...tag, lines: wrap(tag.text, tagMax - 12, 11, 600) })));
    const tagsH = (tags) => tags.reduce((s, tag) => s + tag.lines.length * 14 + 6 + 4, 0) - (tags.length ? 4 : 0);
    const rowH = Math.max(nameLines.length * 18, BOX + 2, ...cellTags.map(tagsH)) + CELL * 2;

    rect(sumX(0), y, SUM_W, rowH, C.sum);
    row.cells.forEach((c, i) => { if (c.error) rect(expX(i), y, EXP_W, rowH, C.errorFill); else if (!c.on) rect(expX(i), y, EXP_W, rowH, C.off); });
    nameLines.forEach((l, k) => text(l, x.name + CELL, y + CELL + 9 + k * 18, { size: 13, weight: 600 }));
    row.cells.forEach((c, i) => {
      const bx = expX(i) + CELL;
      const by = y + CELL + 1;
      if (draw) drawCheck(ctx, bx, by, BOX, c.on);
      let ty = y + CELL;
      for (const tag of cellTags[i]) {
        const h = tag.lines.length * 14 + 6;
        ctx.font = font(11, 600);
        const w = Math.min(tagMax, Math.max(...tag.lines.map((l) => ctx.measureText(l).width)) + 12);
        if (draw) {
          ctx.fillStyle = TAG[tag.kind].bg;
          roundRect(ctx, bx + tagX, ty, w, h, 9);
          ctx.fill();
        }
        tag.lines.forEach((l, k) => text(l, bx + tagX + 6, ty + 3 + 7 + k * 14, { size: 11, weight: 600, color: TAG[tag.kind].fg }));
        ty += h + 4;
      }
    });
    const my = y + CELL + 9;
    text(n(row.share), sumX(1) - CELL, my, { align: "right", weight: 700, color: C.due });
    y += rowH;
    hline(left, left + tableW, y);
  }

  // Tổng row
  const footH = 36;
  rect(left, y, tableW, footH, C.wash);
  text("Tổng", x.name + CELL, y + footH / 2, { weight: 700 });
  grid.foot.totals.forEach((t, i) => text(n(t.total), expX(i) + CELL, y + footH / 2, { weight: 700, color: t.error ? C.muted : C.ink, strike: t.error }));
  text(n(grid.foot.share), sumX(1) - CELL, y + footH / 2, { weight: 700, align: "right", color: C.due });
  y += footH;
  for (const bx of boxes) vline(bx, tableTop, y);
  if (draw) {
    ctx.strokeStyle = C.lineStrong; ctx.lineWidth = 1;
    ctx.strokeRect(left + 0.5, tableTop + 0.5, tableW - 1, y - tableTop - 1);
  }
  y += 8;
  // Legend: drawn tick boxes (the ☑ / ☐ glyphs are missing from the font), then the notes.
  if (draw) drawCheck(ctx, left, y + 1, 12, true);
  text("có tham gia", left + 18, y + 8, { size: 11.5, color: C.muted });
  ctx.font = font(11.5);
  const offX = left + 18 + ctx.measureText("có tham gia").width + 16;
  if (draw) drawCheck(ctx, offX, y + 1, 12, false);
  text("không tham gia", offX + 18, y + 8, { size: 11.5, color: C.muted });
  y += 19;
  const notes = `Phải trả = phần chia của mỗi người${report.skipped.length ? " · Khoản tô đỏ đang lỗi, chưa được tính" : ""} · Đơn vị: đồng`;
  for (const l of wrap(notes, contentW, 11.5)) { text(l, left, y + 8, { size: 11.5, color: C.muted }); y += 17; }
  dashed();

  // ---------- transfers + payment (centered block) ----------
  // Same edges as the table; only an extra-wide table (many expenses) gets a centered, narrower block.
  const BW = Math.min(contentW, 820);
  const bl = left + (contentW - BW) / 2;
  const blockTitle = (title, rightText) => {
    text(title, bl, y + 11, { size: 13, weight: 700 });
    if (rightText) text(rightText, bl + BW, y + 11, { size: 13, weight: 700, color: C.teal, align: "right" });
    y += 26;
  };
  blockTitle("CHUYỂN KHOẢN", `${n(report.transferTotal)} ₫`);
  if (report.transfers.length) {
    for (const t of report.transfers) {
      const amount = `${n(t.amount)} ₫`;
      ctx.font = font(13.5, 700);
      const aw = ctx.measureText(amount).width;
      const lines = wrap(`${t.fromName} → ${t.toName}`, BW - aw - 36, 13.5);
      const h = lines.length * 19 + 12;
      if (draw) { ctx.fillStyle = C.row; roundRect(ctx, bl, y, BW, h, 7); ctx.fill(); }
      lines.forEach((l, k) => text(l, bl + 12, y + 6 + 9.5 + k * 19, { size: 13.5 }));
      text(amount, bl + BW - 12, y + 6 + 9.5, { size: 13.5, weight: 700, color: C.neg, align: "right" });
      y += h + 5;
    }
  } else {
    text("Không ai cần chuyển tiền.", bl, y + 9, { color: C.muted }); y += 22;
  }
  if (report.skipped.length) {
    for (const l of wrap(`Đang bỏ qua khoản lỗi: ${report.skipped.join(", ")}`, BW, 12)) { text(l, bl, y + 9, { size: 12, color: C.error }); y += 18; }
  }

  if (pay?.show) {
    dashed();
    blockTitle(`THANH TOÁN${pay.recipientName ? ` CHO ${pay.recipientName.toUpperCase()}` : ""}`);
    const info = [["Ngân hàng", pay.bank], ["Số tài khoản", pay.account], ["Chủ tài khoản", pay.owner.toUpperCase()], ["Nội dung CK", pay.memo]];
    for (const [label, value] of info) {
      if (!value) continue;
      const isAcc = label === "Số tài khoản";
      const lines = wrap(value, BW - 120, isAcc ? 15 : 13, isAcc ? 700 : 500);
      text(label, bl, y + 10, { size: 12.5, color: C.muted });
      lines.forEach((l, k) => text(l, bl + BW, y + 10 + k * 20, { size: isAcc ? 15 : 13, weight: isAcc ? 700 : 500, color: isAcc ? C.teal : C.ink, align: "right" }));
      y += lines.length * 20 + 4;
    }
  }

  // ---------- QR chuyển khoản ----------
  if (pay?.show && pay.qr && qr) {
    dashed();
    centered(`QUÉT ĐỂ CHUYỂN KHOẢN${pay.recipientName ? ` CHO ${pay.recipientName.toUpperCase()}` : ""}`, 12.5, { weight: 700, color: C.teal });
    const size = 180;
    const s = Math.min(size / qr.naturalWidth, size / qr.naturalHeight) || 1;
    if (draw) {
      ctx.fillStyle = "#fff";
      ctx.strokeStyle = C.line;
      ctx.fillRect(cx - size / 2 - 8, y + 4, size + 16, size + 16);
      ctx.strokeRect(cx - size / 2 - 7.5, y + 4.5, size + 15, size + 15);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(qr, cx - (qr.naturalWidth * s) / 2, y + 12 + (size - qr.naturalHeight * s) / 2, qr.naturalWidth * s, qr.naturalHeight * s);
      ctx.imageSmoothingEnabled = true;
    }
    y += size + 26;
    centered(`ND: ${pay.memo}`, 12, { color: C.amber });
  }

  // ---------- chứng từ ----------
  if (evidence && report.evidence.length) {
    dashed();
    text(`CHỨNG TỪ THANH TOÁN (${report.evidence.length} ảnh)`, left, y + 11, { size: 13, weight: 700 });
    y += 28;
    // Masonry: 2–4 columns by width (1 for a single photo); each photo goes to the shortest column,
    // so tall bills don't stretch the whole image. Photos keep their full content (scaled, never cropped).
    const GAP = 14;
    const list = report.evidence;
    const cols = list.length === 1 ? 1 : Math.min(4, Math.max(2, Math.floor((contentW + GAP) / (220 + GAP))));
    const cw = (contentW - (cols - 1) * GAP) / cols;
    const heights = new Array(cols).fill(0);
    for (const item of list) {
      const k = heights.indexOf(Math.min(...heights));
      const img = images.get(item.id);
      const ix = left + k * (cw + GAP);
      const iy = y + heights[k];
      text(img ? `📎 ${item.code}` : `📎 ${item.code} · không tải được ảnh`, ix, iy + 9, { size: 11.5, weight: 600, color: C.teal });
      let h = 20;
      if (img) {
        const s = Math.min(cw / img.naturalWidth, 900 / img.naturalHeight, 1);
        const iw = img.naturalWidth * s;
        const ih = img.naturalHeight * s;
        if (draw) {
          ctx.drawImage(img, ix, iy + 20, iw, ih);
          ctx.strokeStyle = C.line;
          ctx.strokeRect(ix + 0.5, iy + 20.5, iw - 1, ih - 1);
        }
        h += ih;
      }
      heights[k] += h + GAP;
    }
    y += Math.max(...heights);
  }

  // ---------- footer ----------
  dashed();
  y += 4;
  centered("Cảm ơn cả nhóm. Hẹn gặp lại lần sau!", 13);
  centered("Hóa đơn tạo tự động · Chia Tiền Nhóm", 11.5, { color: C.muted });
  centered(`HĐ #${report.number} · Xuất lúc ${report.exported.time} ${report.exported.date}`, 10.5, { color: C.muted });
  y += 8;
  return y + PAD - 10;
}

function drawCheck(ctx, x, y, size, on) {
  if (on) {
    ctx.fillStyle = C.teal;
    roundRect(ctx, x, y, size, size, 4);
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(x + size * 0.27, y + size * 0.52);
    ctx.lineTo(x + size * 0.43, y + size * 0.68);
    ctx.lineTo(x + size * 0.74, y + size * 0.34);
    ctx.stroke();
    ctx.lineWidth = 1;
  } else {
    ctx.strokeStyle = "#9fbab7";
    ctx.lineWidth = 1.3;
    roundRect(ctx, x + 0.5, y + 0.5, size - 1, size - 1, 4);
    ctx.stroke();
    ctx.lineWidth = 1;
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

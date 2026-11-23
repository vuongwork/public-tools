// Minimal .xlsx writer: SpreadsheetML parts in an uncompressed ("stored") zip. No dependencies.

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

export function crc32(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** files: [{ name, data: string }] → zip bytes (stored, UTF-8 names). */
export function zip(files) {
  const enc = new TextEncoder();
  const chunks = [];
  const central = [];
  let offset = 0;
  for (const file of files) {
    const name = enc.encode(file.name);
    const data = enc.encode(file.data);
    const crc = crc32(data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); // UTF-8 names
    local.setUint16(8, 0, true); // stored
    local.setUint16(10, 0, true);
    local.setUint16(12, 0x21, true); // 1980-01-01
    local.setUint32(14, crc, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, data.length, true);
    local.setUint16(26, name.length, true);
    local.setUint16(28, 0, true);
    chunks.push(new Uint8Array(local.buffer), name, data);

    const entry = new DataView(new ArrayBuffer(46));
    entry.setUint32(0, 0x02014b50, true);
    entry.setUint16(4, 20, true);
    entry.setUint16(6, 20, true);
    entry.setUint16(8, 0x0800, true);
    entry.setUint16(10, 0, true);
    entry.setUint16(12, 0, true);
    entry.setUint16(14, 0x21, true);
    entry.setUint32(16, crc, true);
    entry.setUint32(20, data.length, true);
    entry.setUint32(24, data.length, true);
    entry.setUint16(28, name.length, true);
    entry.setUint32(42, offset, true);
    central.push(new Uint8Array(entry.buffer), name);
    offset += 30 + name.length + data.length;
  }
  const centralSize = central.reduce((s, c) => s + c.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);
  const parts = [...chunks, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}

const esc = (s) => String(s)
  .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function columnName(index) {
  let name = "";
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  return name;
}


/**
 * Style: { bold, italic, strike, size, color: "RRGGBB", fill: "RRGGBB", border: true,
 *          align: "left"|"center"|"right", valign: "top"|"center", wrap, fmt: "money"|"signed"|"text" }
 * Each distinct style becomes one cellXfs entry; fonts/fills/borders are shared.
 */
class Styles {
  constructor() {
    this.fonts = ['<font><sz val="11"/><name val="Calibri"/></font>'];
    this.fills = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>'];
    this.borders = ["<border><left/><right/><top/><bottom/><diagonal/></border>"];
    this.xfs = ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'];
    this.ids = new Map([["{}", 0]]);
  }

  static add(list, xml) {
    const i = list.indexOf(xml);
    return i >= 0 ? i : list.push(xml) - 1;
  }

  id(style = {}) {
    const key = JSON.stringify(style);
    if (this.ids.has(key)) return this.ids.get(key);
    const s = style;
    const color = s.color ? `<color rgb="FF${s.color}"/>` : "";
    const fontId = Styles.add(this.fonts,
      `<font>${s.bold ? "<b/>" : ""}${s.italic ? "<i/>" : ""}${s.strike ? "<strike/>" : ""}<sz val="${s.size ?? 11}"/>${color}<name val="Calibri"/></font>`);
    const fillId = s.fill
      ? Styles.add(this.fills, `<fill><patternFill patternType="solid"><fgColor rgb="FF${s.fill}"/><bgColor indexed="64"/></patternFill></fill>`)
      : 0;
    const side = (name) => `<${name} style="thin"><color rgb="FFD7E8E5"/></${name}>`;
    const borderId = s.border
      ? Styles.add(this.borders, `<border>${side("left")}${side("right")}${side("top")}${side("bottom")}<diagonal/></border>`)
      : 0;
    const numFmtId = { money: 164, signed: 165, text: 49 }[s.fmt] ?? 0;
    const align = s.align || s.wrap || s.valign
      ? `<alignment${s.align ? ` horizontal="${s.align}"` : ""} vertical="${s.valign ?? "center"}"${s.wrap ? ' wrapText="1"' : ""}/>`
      : "";
    const attrs = `numFmtId="${numFmtId}" fontId="${fontId}" fillId="${fillId}" borderId="${borderId}" xfId="0"`
      + `${numFmtId ? ' applyNumberFormat="1"' : ""}${fontId ? ' applyFont="1"' : ""}${fillId ? ' applyFill="1"' : ""}`
      + `${borderId ? ' applyBorder="1"' : ""}${align ? ' applyAlignment="1"' : ""}`;
    const id = this.xfs.push(align ? `<xf ${attrs}>${align}</xf>` : `<xf ${attrs}/>`) - 1;
    this.ids.set(key, id);
    return id;
  }

  xml() {
    const list = (tag, items) => `<${tag} count="${items.length}">${items.join("")}</${tag}>`;
    return `${XML}<styleSheet xmlns="${NS}">`
      + '<numFmts count="2"><numFmt numFmtId="164" formatCode="#,##0"/>'
      + '<numFmt numFmtId="165" formatCode="&quot;+&quot;#,##0;&quot;−&quot;#,##0;0"/></numFmts>'
      + list("fonts", this.fonts) + list("fills", this.fills) + list("borders", this.borders)
      + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
      + list("cellXfs", this.xfs)
      + '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
  }
}

function cellXml(cell, ref, styles) {
  if (cell == null) return "";
  const { v, s = {} } = typeof cell === "object" ? cell : { v: cell };
  const empty = v == null || v === "";
  if (empty && !Object.keys(s).length) return "";
  if (empty) return `<c r="${ref}" s="${styles.id(s)}"/>`;
  if (typeof v === "number") return `<c r="${ref}" s="${styles.id({ fmt: "money", ...s })}"><v>${v}</v></c>`;
  return `<c r="${ref}" t="inlineStr" s="${styles.id(s)}"><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
}

function sheetXml({ rows, widths = [], merges = [], freeze, heights = {} }, styles) {
  const pane = freeze
    ? `<sheetViews><sheetView workbookViewId="0"><pane${freeze.col ? ` xSplit="${freeze.col}"` : ""}${freeze.row ? ` ySplit="${freeze.row}"` : ""}`
      + ` topLeftCell="${columnName(freeze.col ?? 0)}${(freeze.row ?? 0) + 1}" activePane="bottomRight" state="frozen"/></sheetView></sheetViews>`
    : "";
  const cols = widths.length
    ? `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols>`
    : "";
  const body = rows.map((row, r) => {
    const ht = heights[r + 1] ? ` ht="${heights[r + 1]}" customHeight="1"` : "";
    return `<row r="${r + 1}"${ht}>${(row ?? []).map((cell, c) => cellXml(cell, `${columnName(c)}${r + 1}`, styles)).join("")}</row>`;
  }).join("");
  const merged = merges.length ? `<mergeCells count="${merges.length}">${merges.map((m) => `<mergeCell ref="${m}"/>`).join("")}</mergeCells>` : "";
  return `${XML}<worksheet xmlns="${NS}">${pane}${cols}<sheetData>${body}</sheetData>${merged}</worksheet>`;
}

const NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const PKG = "http://schemas.openxmlformats.org/package/2006/relationships";
const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

/** Excel sheet names: ≤31 chars, no []:*?/\ , unique. */
function sheetName(name, used) {
  const base = (String(name).replace(/[[\]:*?/\\]/g, " ").trim() || "Sheet").slice(0, 31);
  let out = base;
  for (let i = 2; used.has(out.toLowerCase()); i++) out = `${base.slice(0, 31 - String(i).length - 1)} ${i}`;
  used.add(out.toLowerCase());
  return out;
}

/**
 * sheets: [{ name, rows: Cell[][], widths?, merges?: ["A1:E1"], freeze?: { row, col }, heights?: { [row1]: pt } }]
 * Cell: null | string | number | { v, s?: Style }. Numbers default to a #,##0 format.
 */
export function buildXlsx(sheets) {
  const used = new Set();
  const names = sheets.map((s) => sheetName(s.name, used));
  const styles = new Styles();
  const sheetFiles = sheets.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: sheetXml(s, styles) }));
  return zip([
    { name: "[Content_Types].xml", data: `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">`
      + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
      + '<Default Extension="xml" ContentType="application/xml"/>'
      + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
      + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
      + sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")
      + "</Types>" },
    { name: "_rels/.rels", data: `${XML}<Relationships xmlns="${PKG}"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
    { name: "xl/workbook.xml", data: `${XML}<workbook xmlns="${NS}" xmlns:r="${REL}"><sheets>`
      + names.map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")
      + "</sheets></workbook>" },
    { name: "xl/_rels/workbook.xml.rels", data: `${XML}<Relationships xmlns="${PKG}">`
      + sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${REL}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")
      + `<Relationship Id="rId${sheets.length + 1}" Type="${REL}/styles" Target="styles.xml"/></Relationships>` },
    { name: "xl/styles.xml", data: styles.xml() },
    ...sheetFiles,
  ]);
}

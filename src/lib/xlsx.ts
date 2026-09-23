// Excel (.xlsx) and CSV reading/writing for GrowthLife Product Importer (runs in the browser).
import ExcelJS from "exceljs";
import JSZip from "jszip";
import Papa from "papaparse";
import { COLUMNS, HELP_PREFIX, SAMPLE_ROWS, headerToKey, type SheetRow } from "./sheet";

export const APP_NAME = "GrowthLife Product Importer";
const SHEET_NAME = "Products";

const LEVEL_COLOR: Record<string, string> = {
  product: "FF1F4E79",
  variant: "FF375623",
  image: "FF7F3F00",
};

export interface ExportOptions {
  rows: SheetRow[];
  shopName?: string;
  /** optional thumbnail per spreadsheet data-row index */
  thumbnails?: (Uint8Array | null | undefined)[];
  template?: boolean;
}

export async function buildWorkbook(opts: ExportOptions): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  wb.creator = APP_NAME;
  wb.created = new Date();
  const ws = wb.addWorksheet(SHEET_NAME, {
    views: [{ state: "frozen", xSplit: 2, ySplit: 4 }],
  });
  ws.columns = COLUMNS.map((c) => ({ key: c.key, width: c.width }));

  // Row 1: title banner
  ws.mergeCells(1, 1, 1, COLUMNS.length);
  const title = ws.getCell(1, 1);
  title.value = `${APP_NAME} — ${opts.template ? "Blank import template" : "Product export"}${
    opts.shopName ? ` (${opts.shopName})` : ""
  } — ${new Date().toISOString().slice(0, 10)}`;
  title.font = { bold: true, size: 16, color: { argb: "FFFFFFFF" } };
  title.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0B6E4F" } };
  title.alignment = { vertical: "middle" };
  ws.getRow(1).height = 30;

  // Row 2: instructions
  ws.mergeCells(2, 1, 2, COLUMNS.length);
  const ins = ws.getCell(2, 1);
  ins.value =
    "HOW TO USE: One row = one variant. Fill product details (Title, Description, Tags, SEO...) on the FIRST row of a product; " +
    "add more rows with the SAME Handle for more sizes/colours. Sale Price = selling price, Regular Price/MRP = crossed-out price. " +
    "First Image URL = thumbnail. You can also paste pictures into the 'Paste Images Here' column. Blue = product, Green = variant, Brown = images. " +
    "Do not change row 3 headers. Row 4 explains each column. Start your data from row 5. See the 'Guide' sheet for details.";
  ins.alignment = { wrapText: true, vertical: "top" };
  ins.font = { size: 11, color: { argb: "FF333333" } };
  ins.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF4CE" } };
  ws.getRow(2).height = 62;

  // Row 3: headers
  const header = ws.getRow(3);
  COLUMNS.forEach((c, i) => {
    const cell = header.getCell(i + 1);
    cell.value = c.header + (c.required ? " *" : "");
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: LEVEL_COLOR[c.level] } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = { bottom: { style: "thin", color: { argb: "FF999999" } } };
  });
  header.height = 34;

  // Row 4: help text
  const help = ws.getRow(4);
  COLUMNS.forEach((c, i) => {
    const cell = help.getCell(i + 1);
    cell.value = HELP_PREFIX + c.help;
    cell.font = { italic: true, size: 9, color: { argb: "FF555555" } };
    cell.alignment = { wrapText: true, vertical: "top" };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF2F2F2" } };
  });
  help.height = 78;

  const rows = opts.rows.length ? opts.rows : opts.template ? SAMPLE_ROWS : [];
  const thumbCol = COLUMNS.findIndex((c) => c.key === "thumbnail");
  rows.forEach((r, idx) => {
    const excelRow = ws.getRow(5 + idx);
    COLUMNS.forEach((c, ci) => {
      const v = r[c.key];
      if (v === undefined || v === "") return;
      const isNum = ["price", "compareAtPrice", "cost", "quantity", "weight"].includes(c.key) && v !== "" && !isNaN(Number(v));
      excelRow.getCell(ci + 1).value = isNum ? Number(v) : v;
    });
    const thumb = opts.thumbnails?.[idx];
    if (thumb && thumbCol >= 0) {
      const id = wb.addImage({ buffer: thumb as any, extension: "png" });
      ws.addImage(id, {
        tl: { col: thumbCol + 0.1, row: 4 + idx + 0.1 },
        ext: { width: 60, height: 60 },
        editAs: "oneCell",
      });
      excelRow.height = 50;
    }
  });

  // Status dropdown and yes/no dropdowns on data rows
  const lastRow = Math.max(rows.length + 4, 500);
  const colLetter = (key: string) => ws.getColumn(COLUMNS.findIndex((c) => c.key === key) + 1).letter;
  const addList = (key: string, list: string) => {
    for (let r = 5; r <= lastRow; r++) {
      ws.getCell(`${colLetter(key)}${r}`).dataValidation = {
        type: "list",
        allowBlank: true,
        formulae: [`"${list}"`],
      };
    }
  };
  addList("status", "active,draft,archived");
  addList("weightUnit", "g,kg,lb,oz");
  for (const k of ["requiresShipping", "taxable", "continueSelling"]) addList(k, "yes,no");

  // Guide sheet
  const guide = wb.addWorksheet("Guide");
  guide.columns = [
    { header: "Column", key: "h", width: 26 },
    { header: "Applies to", key: "l", width: 12 },
    { header: "Required", key: "r", width: 10 },
    { header: "What to fill", key: "d", width: 110 },
  ];
  guide.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  guide.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0B6E4F" } };
  for (const c of COLUMNS) {
    guide.addRow({ h: c.header, l: c.level, r: c.required ? "Yes" : "", d: c.help }).alignment = { wrapText: true, vertical: "top" };
  }
  guide.addRow({});
  for (const tip of [
    "Update existing products: export, edit the cells, import the same file. Products are matched by Handle.",
    "Create new products: add rows with a new Handle (or leave Handle empty and it is made from the Title).",
    "Variants: repeat the Handle on each row, fill Option1 Name only on the first row and the Option values on every row.",
    "Images: comma separated URLs in 'Image URLs' (first = thumbnail), or paste pictures in the 'Paste Images Here' column.",
    "Removing an image URL from the list removes that image from the product on import.",
    "Quantity is set at your store's primary location.",
    "Supported files for import: .xlsx and .csv (also Shopify's own product CSV).",
  ]) {
    guide.addRow({ h: "Tip", d: tip }).alignment = { wrapText: true, vertical: "top" };
  }

  const buf = await wb.xlsx.writeBuffer();
  return new Uint8Array(buf as ArrayBuffer);
}

export function buildCsv(rows: SheetRow[]): string {
  const data = rows.map((r) => COLUMNS.filter((c) => c.key !== "thumbnail" && c.key !== "embeddedImages").map((c) => r[c.key] ?? ""));
  return Papa.unparse({
    fields: COLUMNS.filter((c) => c.key !== "thumbnail" && c.key !== "embeddedImages").map((c) => c.header),
    data,
  });
}

// ---------------------------------------------------------------- reading

export interface EmbeddedImage {
  row: number; // 1-based spreadsheet row
  col: number; // 1-based column
  buffer: Uint8Array;
  extension: string;
}

export interface ReadResult {
  rows: (SheetRow & { __row: string })[];
  images: EmbeddedImage[];
  embeddedImageCol?: number;
  thumbnailCol?: number;
}

function cellText(cell: ExcelJS.Cell): string {
  const v: any = cell.value;
  if (v === null || v === undefined) return "";
  if (typeof v === "object") {
    if ("richText" in v) return v.richText.map((t: any) => t.text).join("");
    if ("hyperlink" in v) return String(v.text && typeof v.text === "string" ? v.text : v.hyperlink);
    if ("result" in v) return v.result == null ? "" : String(v.result);
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    if ("error" in v) return "";
  }
  return String(v);
}

function mapHeader(cells: string[]): Record<number, string> | null {
  const map: Record<number, string> = {};
  cells.forEach((h, i) => {
    const key = headerToKey(h.replace(/\s*\*\s*$/, ""));
    if (key) map[i] = key;
  });
  const keys = Object.values(map);
  return keys.includes("handle") || keys.includes("title") ? map : null;
}

function rowsFromGrid(grid: string[][], firstRowNo = 1) {
  let headerIdx = -1;
  let headerMap: Record<number, string> | null = null;
  for (let i = 0; i < Math.min(grid.length, 15); i++) {
    const m = mapHeader(grid[i] ?? []);
    if (m) {
      headerIdx = i;
      headerMap = m;
      break;
    }
  }
  if (!headerMap) {
    throw new Error(
      "Could not find the header row. Keep the column headers (Handle, Title, ...) from the exported file or template.",
    );
  }
  const rows: (SheetRow & { __row: string })[] = [];
  for (let i = headerIdx + 1; i < grid.length; i++) {
    const line = grid[i] ?? [];
    if (line.some((c) => String(c ?? "").startsWith(HELP_PREFIX))) continue; // help row
    const r: SheetRow & { __row: string } = { __row: String(i + firstRowNo) };
    for (const [idx, key] of Object.entries(headerMap)) {
      const val = String(line[Number(idx)] ?? "").trim();
      if (val) r[key] = r[key] ? `${r[key]}, ${val}` : val;
    }
    rows.push(r);
  }
  const colOf = (key: string) => {
    const e = Object.entries(headerMap).find(([, k]) => k === key);
    return e ? Number(e[0]) + 1 : undefined;
  };
  return { rows, colOf };
}

export function readCsv(text: string): ReadResult {
  const parsed = Papa.parse<string[]>(text.replace(/^\uFEFF/, ""), { skipEmptyLines: false });
  const { rows } = rowsFromGrid(parsed.data as string[][]);
  return { rows, images: [] };
}

export async function readWorkbook(buffer: Uint8Array | ArrayBuffer): Promise<ReadResult> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as any);
  const ws = wb.getWorksheet(SHEET_NAME) ?? wb.worksheets[0];
  if (!ws) throw new Error("The workbook has no sheets.");

  const grid: string[][] = [];
  ws.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    const line: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      line[colNumber - 1] = cellText(cell);
    });
    grid[rowNumber - 1] = line;
  });
  for (let i = 0; i < grid.length; i++) grid[i] ||= [];
  const { rows, colOf } = rowsFromGrid(grid, 1);

  // Floating pictures (Insert > Picture > Place over cells)
  const images: EmbeddedImage[] = [];
  for (const img of ws.getImages()) {
    const media = wb.getImage(Number(img.imageId)) as any;
    if (!media?.buffer) continue;
    images.push({
      row: Math.floor(img.range.tl.nativeRow ?? (img.range.tl as any).row) + 1,
      col: Math.floor(img.range.tl.nativeCol ?? (img.range.tl as any).col) + 1,
      buffer: new Uint8Array(media.buffer),
      extension: media.extension || "png",
    });
  }
  // Pictures placed IN cells (Excel 365 "Place in Cell" / IMAGE rich values)
  try {
    images.push(...(await readInCellImages(buffer, ws.name, wb)));
  } catch (e) {
    console.warn("In-cell image parsing failed", e);
  }

  return { rows, images, embeddedImageCol: colOf("embeddedImages"), thumbnailCol: colOf("thumbnail") };
}

/** Parse Excel 365 in-cell pictures (richData) which ExcelJS does not expose. */
async function readInCellImages(buffer: Uint8Array | ArrayBuffer, sheetName: string, wb: ExcelJS.Workbook): Promise<EmbeddedImage[]> {
  const zip = await JSZip.loadAsync(buffer);
  const rvRelXml = await zip.file("xl/richData/richValueRel.xml")?.async("string");
  const rvXml = await zip.file("xl/richData/rdrichvalue.xml")?.async("string");
  if (!rvRelXml || !rvXml) return [];

  const relsXml = (await zip.file("xl/richData/_rels/richValueRel.xml.rels")?.async("string")) ?? "";
  const relTargets: Record<string, string> = {};
  for (const m of relsXml.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = /Id="([^"]+)"/.exec(m[0])?.[1];
    const target = /Target="([^"]+)"/.exec(m[0])?.[1];
    if (id && target) relTargets[id] = target;
  }
  const relOrder = [...rvRelXml.matchAll(/<rel\b[^>]*r:id="([^"]+)"/g)].map((m) => m[1]);
  // rich value index -> rel index (first <v> of each <rv>)
  const rvToRel = [...rvXml.matchAll(/<rv\b[^>]*>([\s\S]*?)<\/rv>/g)].map((m) => {
    const v = /<v[^>]*>([^<]*)<\/v>/.exec(m[1]);
    return v ? Number(v[1]) : -1;
  });

  // metadata: vm (1-based) -> valueMetadata bk -> rc v -> futureMetadata bk -> rvb i
  const metaXml = (await zip.file("xl/metadata.xml")?.async("string")) ?? "";
  const futureBks = [...(/<futureMetadata\b[^>]*name="XLRICHVALUE"[^>]*>([\s\S]*?)<\/futureMetadata>/.exec(metaXml)?.[1] ?? "").matchAll(/<bk>([\s\S]*?)<\/bk>/g)].map(
    (m) => Number(/<xlrd:rvb\b[^>]*i="(\d+)"/.exec(m[1])?.[1] ?? -1),
  );
  const valueBks = [...(/<valueMetadata\b[^>]*>([\s\S]*?)<\/valueMetadata>/.exec(metaXml)?.[1] ?? "").matchAll(/<bk>([\s\S]*?)<\/bk>/g)].map(
    (m) => Number(/<rc\b[^>]*v="(\d+)"/.exec(m[1])?.[1] ?? -1),
  );
  const vmToRichValue = (vm: number) => {
    const rc = valueBks[vm - 1];
    if (rc === undefined || rc < 0) return vm - 1;
    return futureBks[rc] ?? vm - 1;
  };

  // find the sheet file
  const wbXml = (await zip.file("xl/workbook.xml")?.async("string")) ?? "";
  const wbRels = (await zip.file("xl/_rels/workbook.xml.rels")?.async("string")) ?? "";
  const sheetRid = new RegExp(`<sheet\\b[^>]*name="${sheetName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[^>]*r:id="([^"]+)"`).exec(wbXml)?.[1]
    ?? /<sheet\b[^>]*r:id="([^"]+)"/.exec(wbXml)?.[1];
  const sheetTarget = sheetRid
    ? new RegExp(`<Relationship\\b[^>]*Id="${sheetRid}"[^>]*Target="([^"]+)"`).exec(wbRels)?.[1]
      ?? new RegExp(`<Relationship\\b[^>]*Target="([^"]+)"[^>]*Id="${sheetRid}"`).exec(wbRels)?.[1]
    : undefined;
  const sheetPath = sheetTarget ? `xl/${sheetTarget.replace(/^\/?xl\//, "").replace(/^\//, "")}` : "xl/worksheets/sheet1.xml";
  const sheetXml = (await zip.file(sheetPath)?.async("string")) ?? "";

  const out: EmbeddedImage[] = [];
  for (const m of sheetXml.matchAll(/<c\b([^>]*)\bvm="(\d+)"([^>]*)>/g)) {
    const attrs = m[1] + m[3];
    const ref = /r="([A-Z]+)(\d+)"/.exec(attrs);
    if (!ref) continue;
    const col = ref[1].split("").reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
    const row = Number(ref[2]);
    const rvIdx = vmToRichValue(Number(m[2]));
    const relIdx = rvToRel[rvIdx] ?? rvIdx;
    const rid = relOrder[relIdx];
    const target = rid ? relTargets[rid] : undefined;
    if (!target) continue;
    const path = "xl/" + target.replace(/^\.\.\//, "").replace(/^\/?xl\//, "");
    const file = zip.file(path);
    if (!file) continue;
    out.push({
      row,
      col,
      buffer: await file.async("uint8array"),
      extension: (path.split(".").pop() || "png").toLowerCase(),
    });
  }
  void wb;
  return out;
}

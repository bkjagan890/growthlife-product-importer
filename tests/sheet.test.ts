import { describe, it, expect } from "vitest";
import { rowsToDrafts, draftsToRows, SAMPLE_ROWS } from "../app/lib/sheet";
import { buildWorkbook, readWorkbook, buildCsv, readCsv } from "../app/lib/xlsx.server";
import { regenerateVariants, checkCompleteness } from "../app/lib/model";
import ExcelJS from "exceljs";

describe("rowsToDrafts", () => {
  it("groups variant rows by handle and builds options", () => {
    const { drafts, issues } = rowsToDrafts(SAMPLE_ROWS);
    expect(drafts).toHaveLength(2);
    const t = drafts[0];
    expect(t.title).toBe("Classic Cotton T-Shirt");
    expect(t.options).toEqual([
      { name: "Size", values: ["M", "L"] },
      { name: "Color", values: ["Red", "Black"] },
    ]);
    expect(t.variants).toHaveLength(3);
    expect(t.variants[2]).toMatchObject({ optionValues: ["L", "Red"], price: "549", compareAtPrice: "1099", quantity: 5, sku: "TS-L-RED" });
    expect(t.images.map((i) => i.src)).toHaveLength(2);
    expect(t.collections).toEqual(["Men", "New Arrivals"]);
    expect(t.metafields).toEqual([{ namespace: "custom", key: "material", value: "Cotton" }]);
    expect(t.status).toBe("ACTIVE");
    const h = drafts[1];
    expect(h.options).toEqual([]);
    expect(h.variants[0]).toMatchObject({ weight: 0.5, weightUnit: "KILOGRAMS", price: "349" });
    expect(issues).toEqual([]);
  });

  it("creates handle from title, parses money and flags problems", () => {
    const { drafts, issues } = rowsToDrafts([
      { title: "Red Drill Machine!", price: "₹1,299", compareAtPrice: "999", status: "live", imageUrls: "not-a-url, https://x.com/a.jpg" },
    ]);
    expect(drafts[0].handle).toBe("red-drill-machine");
    expect(drafts[0].variants[0].price).toBe("1299");
    expect(drafts[0].images).toEqual([{ src: "https://x.com/a.jpg", alt: undefined }]);
    expect(issues.map((i) => i.message).join(" ")).toMatch(/MRP.*not higher/);
    expect(issues.map((i) => i.message).join(" ")).toMatch(/Unknown status/);
    expect(issues.map((i) => i.message).join(" ")).toMatch(/not a URL/);
  });

  it("round trips drafts -> rows -> drafts", () => {
    const first = rowsToDrafts(SAMPLE_ROWS).drafts;
    const again = rowsToDrafts(draftsToRows(first)).drafts;
    expect(again).toEqual(first);
  });
});

describe("xlsx / csv files", () => {
  it("template workbook re-imports to the same products", async () => {
    const buf = await buildWorkbook({ rows: [], template: true });
    const read = await readWorkbook(buf);
    const { drafts } = rowsToDrafts(read.rows);
    expect(drafts).toEqual(rowsToDrafts(SAMPLE_ROWS).drafts);
    expect(read.rows[0].__row).toBe("5");
  });

  it("csv round trip", () => {
    const csv = buildCsv(SAMPLE_ROWS);
    const read = readCsv(csv);
    expect(rowsToDrafts(read.rows).drafts).toEqual(rowsToDrafts(SAMPLE_ROWS).drafts);
  });

  it("reads Shopify's own CSV export format", () => {
    const csv = `Handle,Title,Body (HTML),Vendor,Option1 Name,Option1 Value,Variant SKU,Variant Price,Variant Compare At Price,Variant Inventory Qty,Image Src
shirt,Shirt,<p>Hi</p>,ACME,Size,S,SH-S,10,20,3,https://cdn.x/1.jpg
shirt,,,,,M,SH-M,11,20,4,https://cdn.x/2.jpg`;
    const { drafts } = rowsToDrafts(readCsv(csv).rows);
    expect(drafts[0].variants.map((v) => v.sku)).toEqual(["SH-S", "SH-M"]);
    expect(drafts[0].images).toHaveLength(2);
    expect(drafts[0].options[0]).toEqual({ name: "Size", values: ["S", "M"] });
  });

  it("finds pictures pasted over the 'Paste Images Here' column", async () => {
    const buf = await buildWorkbook({ rows: SAMPLE_ROWS });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as any);
    const ws = wb.getWorksheet("Products")!;
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
    const id = wb.addImage({ buffer: png as any, extension: "png" });
    const col = ws.getRow(3).values as any[];
    const c = col.findIndex((v) => v === "Paste Images Here");
    ws.addImage(id, { tl: { col: c - 1, row: 7 }, ext: { width: 20, height: 20 } }); // row 8
    const out = Buffer.from(await wb.xlsx.writeBuffer() as ArrayBuffer);
    const read = await readWorkbook(out);
    expect(read.images).toHaveLength(1);
    expect(read.images[0].row).toBe(8);
    expect(read.images[0].col).toBe(read.embeddedImageCol);
  });
});

describe("model helpers", () => {
  it("regenerates variants keeping existing data", () => {
    const v = regenerateVariants(
      [{ name: "Size", values: ["S", "M"] }, { name: "Color", values: ["Red"] }],
      [{ optionValues: ["S", "Red"], price: "5", sku: "A" }],
    );
    expect(v).toHaveLength(2);
    expect(v[0]).toMatchObject({ sku: "A", price: "5" });
    expect(v[1]).toMatchObject({ optionValues: ["M", "Red"], price: "5", quantity: 0 });
  });
  it("scores completeness", () => {
    const r = checkCompleteness({ id: "1", handle: "h", title: "T", status: "ACTIVE", vendor: "", productType: "", tags: [], imageCount: 0, hasDescription: false, collectionsCount: 0, variantsCount: 1, priceMin: "10", totalInventory: 0, skuMissing: true, updatedAt: "" });
    expect(r.complete).toBe(false);
    expect(r.missing).toContain("Image");
  });
});

import { matchKeyFromFilename } from "../app/lib/filename";
describe("image file names", () => {
  it("strips numbering suffixes", () => {
    expect(matchKeyFromFilename("red-shirt_2.jpg")).toBe("red-shirt");
    expect(matchKeyFromFilename("TS-M-RED (3).png")).toBe("TS-M-RED");
    expect(matchKeyFromFilename("hammer-2.webp")).toBe("hammer-2");
    expect(matchKeyFromFilename("steel-hammer-500g.jpg")).toBe("steel-hammer-500g");
  });
});

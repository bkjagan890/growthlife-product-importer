// Everything the pages do, running fully in the browser against Shopify's Admin API.
import {
  appendImages,
  buildSaveContext,
  directAdmin as admin,
  findProductForImage,
  getProductDraft,
  iterateAllDrafts,
  listCollections,
  listProducts,
  mimeFromExt,
  saveDraft,
  stagedUpload,
  type SaveContext,
  type SaveResult,
} from "./shopify";
import type { ProductDraft, ProductSummary } from "./model";
import { draftsToRows, rowsToDrafts, type RowIssue } from "./sheet";
import { buildCsv, buildWorkbook, readCsv, readWorkbook } from "./xlsx";

export { listProducts };

export function loadProductsPage(cursor: string | null) {
  return listProducts(admin, cursor);
}

export async function loadProduct(id: string | null) {
  const [draft, collections] = await Promise.all([
    id ? getProductDraft(admin, id) : Promise.resolve(null),
    listCollections(admin),
  ]);
  return { draft, collections };
}

let ctxPromise: Promise<SaveContext> | null = null;
export function saveContext(refresh = false) {
  if (!ctxPromise || refresh) ctxPromise = buildSaveContext(admin);
  return ctxPromise;
}

export async function saveDrafts(drafts: ProductDraft[], keepWhenEmpty: boolean) {
  const ctx = await saveContext();
  const results: SaveResult[] = [];
  for (const d of drafts) results.push(await saveDraft(admin, ctx, d, { keepWhenEmpty }));
  return results;
}

export async function summaryFor(productId: string): Promise<ProductSummary | null> {
  const num = productId.split("/").pop();
  const page = await listProducts(admin, null, `id:${num}`);
  return page.items[0] ?? null;
}

export async function uploadImage(file: File, matchKey?: string) {
  const ext = file.name.split(".").pop() ?? "png";
  const resourceUrl = await stagedUpload(admin, { buffer: file, filename: file.name, mimeType: file.type || mimeFromExt(ext) });
  if (!matchKey) return { resourceUrl };
  const product = await findProductForImage(admin, matchKey);
  if (!product) throw new Error(`No product with handle or SKU "${matchKey}"`);
  await appendImages(admin, product.id, [{ src: resourceUrl, alt: product.title }]);
  return { resourceUrl, product };
}

// ------------------------------------------------------------------ export

export interface ExportRequest {
  format: "xlsx" | "csv";
  status?: string;
  q?: string;
  ids?: string[];
  thumbs?: boolean;
  template?: boolean;
  shopName?: string;
  onProgress?: (n: number) => void;
}

export async function exportProducts(req: ExportRequest) {
  const stamp = new Date().toISOString().slice(0, 10);
  const shop = req.shopName ?? shopName();
  if (req.template) {
    const buf = await buildWorkbook({ rows: [], template: true, shopName: shop });
    return saveBlob(new Blob([buf as any], { type: XLSX_MIME }), "growthlife-import-template.xlsx");
  }
  const parts: string[] = [];
  if (req.status && req.status !== "all") parts.push(`status:${req.status}`);
  const ids = (req.ids ?? []).map((s) => s.split("/").pop()).filter(Boolean);
  if (ids.length) parts.push(`(${ids.map((id) => `id:${id}`).join(" OR ")})`);
  if (req.q) parts.push(req.q);

  const drafts: ProductDraft[] = [];
  for await (const d of iterateAllDrafts(admin, parts.join(" AND ") || undefined)) {
    drafts.push(d);
    req.onProgress?.(drafts.length);
  }
  const rows = draftsToRows(drafts);
  if (req.format === "csv") {
    return saveBlob(new Blob(["﻿" + buildCsv(rows)], { type: "text/csv;charset=utf-8" }), `products-${shop}-${stamp}.csv`);
  }
  let thumbnails: (Uint8Array | null)[] | undefined;
  if (req.thumbs) {
    thumbnails = new Array(rows.length).fill(null);
    let rowIdx = 0;
    const jobs: Promise<void>[] = [];
    for (const d of drafts) {
      const idx = rowIdx;
      const img = d.images[0]?.src;
      if (img) {
        jobs.push(
          fetch(img.split("?")[0] + "?width=120&height=120&format=png")
            .then(async (r) => {
              if (r.ok) thumbnails![idx] = new Uint8Array(await r.arrayBuffer());
            })
            .catch(() => undefined),
        );
      }
      rowIdx += Math.max(1, d.variants.length);
      if (jobs.length >= 8) await Promise.all(jobs.splice(0));
    }
    await Promise.all(jobs);
  }
  const buf = await buildWorkbook({ rows, shopName: shop, thumbnails });
  return saveBlob(new Blob([buf as any], { type: XLSX_MIME }), `products-${shop}-${stamp}.xlsx`);
}

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export function shopName() {
  try {
    const shop = (window as any).shopify?.config?.shop || new URLSearchParams(location.search).get("shop") || "";
    return String(shop).replace(".myshopify.com", "") || "store";
  } catch {
    return "store";
  }
}

export function saveBlob(blob: Blob, name: string) {
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 30000);
  return name;
}

// ------------------------------------------------------------------ import

export interface ParsedImport {
  drafts: ProductDraft[];
  issues: RowIssue[];
  pasted: number;
  rows: number;
}

export async function parseImportFile(file: File, onStatus?: (s: string) => void): Promise<ParsedImport> {
  const name = file.name.toLowerCase();
  const buffer = new Uint8Array(await file.arrayBuffer());
  const read = name.endsWith(".csv") || name.endsWith(".txt")
    ? readCsv(new TextDecoder("utf-8").decode(buffer))
    : await readWorkbook(buffer);
  const parsed = rowsToDrafts(read.rows);

  // pictures pasted into the sheet -> upload and attach to the product on that row
  const rowToHandle = new Map<number, string>();
  for (const [handle, rows] of Object.entries(parsed.rowsByHandle)) for (const r of rows) rowToHandle.set(r, handle);
  const pics = read.images.filter((img) => img.col !== read.thumbnailCol).sort((a, b) => a.row - b.row || a.col - b.col);
  const pasted = new Map<string, { src: string; alt: string; order: number }[]>();
  let uploaded = 0;
  const queue = [...pics];
  const worker = async () => {
    while (queue.length) {
      const img = queue.shift()!;
      const handle = rowToHandle.get(img.row);
      const draft = handle ? parsed.drafts.find((d) => d.handle === handle) : undefined;
      if (!draft) {
        parsed.issues.push({ row: img.row, handle: "", message: "Picture is not on a product row, skipped." });
        continue;
      }
      try {
        const src = await stagedUpload(admin, {
          buffer: img.buffer,
          filename: `${draft.handle}-${img.row}-${img.col}.${img.extension}`,
          mimeType: mimeFromExt(img.extension),
        });
        pasted.set(draft.handle, [...(pasted.get(draft.handle) ?? []), { src, alt: draft.title, order: img.row * 1000 + img.col }]);
        uploaded++;
        onStatus?.(`Uploaded ${uploaded}/${pics.length} pictures from the sheet…`);
      } catch (e: any) {
        parsed.issues.push({ row: img.row, handle: draft.handle, message: `Picture upload failed: ${e?.message ?? e}` });
      }
    }
  };
  if (pics.length) onStatus?.(`Uploading ${pics.length} pictures from the sheet…`);
  await Promise.all([worker(), worker(), worker(), worker()]);
  for (const d of parsed.drafts) {
    const list = pasted.get(d.handle);
    if (list) d.images.push(...list.sort((a, b) => a.order - b.order).map(({ src, alt }) => ({ src, alt })));
  }
  return { drafts: parsed.drafts, issues: parsed.issues, pasted: uploaded, rows: read.rows.length };
}

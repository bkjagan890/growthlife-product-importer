import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { iterateAllDrafts } from "../lib/shopify-products.server";
import { draftsToRows, type SheetRow } from "../lib/sheet";
import { buildCsv, buildWorkbook } from "../lib/xlsx.server";
import type { ProductDraft } from "../lib/model";

// GET ?format=xlsx|csv&status=active|draft|archived|all&q=...&ids=1,2&thumbs=1&template=1
export const loader = async ({ request, }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const format = url.searchParams.get("format") === "csv" ? "csv" : "xlsx";
  const template = url.searchParams.get("template") === "1";
  const shopName = session.shop.replace(".myshopify.com", "");
  const stamp = new Date().toISOString().slice(0, 10);

  if (template) {
    const buf = await buildWorkbook({ rows: [], template: true, shopName });
    return file(buf, `growthlife-import-template.xlsx`);
  }

  const parts: string[] = [];
  const status = url.searchParams.get("status");
  if (status && status !== "all") parts.push(`status:${status}`);
  const ids = (url.searchParams.get("ids") ?? "").split(",").map((s) => s.trim().split("/").pop()).filter(Boolean);
  if (ids.length) parts.push(`(${ids.map((id) => `id:${id}`).join(" OR ")})`);
  const q = url.searchParams.get("q");
  if (q) parts.push(q);

  const drafts: ProductDraft[] = [];
  for await (const d of iterateAllDrafts(admin, parts.join(" AND ") || undefined)) drafts.push(d);
  const rows: SheetRow[] = draftsToRows(drafts);

  if (format === "csv") {
    return new Response("\uFEFF" + buildCsv(rows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="products-${shopName}-${stamp}.csv"`,
      },
    });
  }

  let thumbnails: (Buffer | null)[] | undefined;
  if (url.searchParams.get("thumbs") === "1") {
    // one small preview per product's first row
    thumbnails = new Array(rows.length).fill(null);
    let rowIdx = 0;
    const jobs: Promise<void>[] = [];
    for (const d of drafts) {
      const idx = rowIdx;
      const img = d.images[0]?.src;
      if (img && idx < 1500) {
        jobs.push(
          fetch(img.split("?")[0] + "?width=120&height=120&format=png")
            .then(async (r) => {
              if (r.ok) thumbnails![idx] = Buffer.from(await r.arrayBuffer());
            })
            .catch(() => undefined),
        );
      }
      rowIdx += Math.max(1, d.variants.length);
      if (jobs.length >= 8) await Promise.all(jobs.splice(0));
    }
    await Promise.all(jobs);
  }
  const buf = await buildWorkbook({ rows, shopName, thumbnails });
  return file(buf, `products-${shopName}-${stamp}.xlsx`);
};

function file(buf: Buffer, name: string) {
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${name}"`,
    },
  });
}

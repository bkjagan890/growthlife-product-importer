import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { rowsToDrafts } from "../lib/sheet";
import { readCsv, readWorkbook } from "../lib/xlsx.server";
import { mimeFromExt, stagedUpload } from "../lib/shopify-products.server";

// multipart: file (.xlsx / .csv) -> { drafts, issues } with pasted pictures already uploaded
export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return Response.json({ error: "Please choose a file." }, { status: 400 });
    const name = file.name.toLowerCase();
    const buffer = Buffer.from(await file.arrayBuffer());
    const read = name.endsWith(".csv") || name.endsWith(".txt")
      ? readCsv(buffer.toString("utf8"))
      : await readWorkbook(buffer);
    const parsed = rowsToDrafts(read.rows);

    // pictures pasted into the sheet -> upload and attach to the product on that row
    const rowToHandle = new Map<number, string>();
    for (const [handle, rows] of Object.entries(parsed.rowsByHandle)) for (const r of rows) rowToHandle.set(r, handle);
    const pics = read.images
      .filter((img) => img.col !== read.thumbnailCol)
      .sort((a, b) => a.row - b.row || a.col - b.col);
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
          (draft as any).__pasted = [...((draft as any).__pasted ?? []), { src, alt: draft.title, order: img.row * 1000 + img.col }];
          uploaded++;
        } catch (e: any) {
          parsed.issues.push({ row: img.row, handle: draft.handle, message: `Picture upload failed: ${e?.message ?? e}` });
        }
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
    for (const d of parsed.drafts as any[]) {
      if (d.__pasted) {
        d.images.push(...d.__pasted.sort((a: any, b: any) => a.order - b.order).map(({ src, alt }: any) => ({ src, alt })));
        delete d.__pasted;
      }
    }
    return Response.json({ drafts: parsed.drafts, issues: parsed.issues, pasted: uploaded, rows: read.rows.length });
  } catch (e: any) {
    return Response.json({ error: String(e?.message ?? e) }, { status: 400 });
  }
};

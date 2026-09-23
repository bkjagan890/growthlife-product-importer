import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import {
  buildSaveContext,
  getProductDraft,
  listCollections,
  listProducts,
  saveDraft,
} from "../lib/shopify-products.server";
import type { ProductDraft } from "../lib/model";

// GET ?id=gid://shopify/Product/1  -> full product draft + collection list
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const id = new URL(request.url).searchParams.get("id");
  try {
    const [draft, collections] = await Promise.all([
      id ? getProductDraft(admin, id) : Promise.resolve(null),
      listCollections(admin),
    ]);
    return Response.json({ draft, collections });
  } catch (e: any) {
    return Response.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
};

// POST { draft, keepWhenEmpty? } -> save product (create or update)
export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const body = (await request.json()) as { draft?: ProductDraft; drafts?: ProductDraft[]; keepWhenEmpty?: boolean };
  const drafts = body.drafts ?? (body.draft ? [body.draft] : []);
  try {
    const ctx = await buildSaveContext(admin);
    const results = [];
    for (const d of drafts) results.push(await saveDraft(admin, ctx, d, { keepWhenEmpty: !!body.keepWhenEmpty }));
    // fresh summary for the grid when a single product was edited
    let summary = null;
    if (drafts.length === 1 && results[0].ok && results[0].id) {
      const num = results[0].id.split("/").pop();
      const page = await listProducts(admin, null, `id:${num}`);
      summary = page.items[0] ?? null;
    }
    return Response.json({ results, summary });
  } catch (e: any) {
    return Response.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
};

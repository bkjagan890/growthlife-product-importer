import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { listProducts } from "../lib/shopify-products.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const url = new URL(request.url);
  try {
    const page = await listProducts(admin, url.searchParams.get("cursor"), url.searchParams.get("q") ?? undefined);
    return Response.json(page);
  } catch (e: any) {
    return Response.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
};

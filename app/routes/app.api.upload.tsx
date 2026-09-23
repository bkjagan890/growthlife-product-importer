import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { appendImages, findProductForImage, mimeFromExt, stagedUpload } from "../lib/shopify-products.server";

// multipart: file, [matchKey] -> uploads image; if matchKey is given the image
// is appended to the product whose handle or SKU equals matchKey.
export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return Response.json({ error: "No file" }, { status: 400 });
    const matchKey = String(form.get("matchKey") ?? "").trim();
    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = file.name.split(".").pop() ?? "png";
    const resourceUrl = await stagedUpload(admin, {
      buffer,
      filename: file.name,
      mimeType: file.type || mimeFromExt(ext),
    });
    if (!matchKey) return Response.json({ resourceUrl });
    const product = await findProductForImage(admin, matchKey);
    if (!product) return Response.json({ resourceUrl, error: `No product with handle or SKU "${matchKey}"` });
    await appendImages(admin, product.id, [{ src: resourceUrl, alt: product.title }]);
    return Response.json({ resourceUrl, product });
  } catch (e: any) {
    return Response.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
};

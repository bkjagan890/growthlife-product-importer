// All Shopify Admin GraphQL access for GrowthLife Product Importer.
import {
  DEFAULT_OPTION,
  DEFAULT_VALUE,
  type DraftImage,
  type ProductDraft,
  type ProductStatus,
  type ProductSummary,
} from "./model";

// Admin API client that talks to Shopify directly from the browser.
// Inside the Shopify admin, App Bridge authorises fetch() calls to "shopify:admin/..."
// (Direct API access), so no server, no API key and no secret are needed.
export const API_VERSION = "2025-10";

export interface AdminClient {
  graphql: (query: string, options?: { variables?: Record<string, unknown> }) => Promise<Response>;
}

export const directAdmin: AdminClient = {
  graphql: (query, options) =>
    fetch(`shopify:admin/api/${API_VERSION}/graphql.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables: options?.variables ?? {} }),
    }),
};

export class ShopifyError extends Error {}

export async function gql<T = any>(admin: AdminClient, query: string, variables?: Record<string, unknown>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const res = await admin.graphql(query, { variables });
    let json: any;
    try {
      json = await res.json();
    } catch {
      throw new ShopifyError(`Shopify API error (HTTP ${res.status})`);
    }
    const errors = json.errors ? (Array.isArray(json.errors) ? json.errors : [{ message: String(json.errors) }]) : [];
    if (errors.length) {
      const msg = errors.map((e: any) => e.message).join("; ");
      if (/throttled/i.test(msg) && attempt < 5) {
        await sleep(1000 * (attempt + 1));
        continue;
      }
      throw new ShopifyError(msg);
    }
    if (!res.ok) throw new ShopifyError(`Shopify API error (HTTP ${res.status})`);
    return json.data as T;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const stripQuery = (u: string) => u.split("?")[0];

// ------------------------------------------------------------------ list

export const PRODUCTS_LIST_QUERY = `#graphql
  query GLProductList($first: Int!, $after: String, $query: String) {
    products(first: $first, after: $after, query: $query, sortKey: UPDATED_AT, reverse: true) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id handle title status vendor productType tags updatedAt totalInventory tracksInventory
        description(truncateAt: 40)
        seo { title description }
        featuredMedia { preview { image { url(transform: { maxWidth: 160, maxHeight: 160 }) } } }
        mediaCount { count }
        collections(first: 1) { nodes { id } }
        variantsCount { count }
        priceRangeV2 { minVariantPrice { amount } maxVariantPrice { amount } }
        compareAtPriceRange { maxVariantCompareAtPrice { amount } }
        variants(first: 10) { nodes { sku } }
      }
    }
  }`;

export async function listProducts(admin: AdminClient, after?: string | null, query?: string) {
  const data = await gql(admin, PRODUCTS_LIST_QUERY, { first: 50, after: after || null, query: query || null });
  const conn = data.products;
  const items: ProductSummary[] = conn.nodes.map((p: any) => ({
    id: p.id,
    handle: p.handle,
    title: p.title,
    status: p.status,
    vendor: p.vendor ?? "",
    productType: p.productType ?? "",
    tags: p.tags ?? [],
    image: p.featuredMedia?.preview?.image?.url,
    imageCount: p.mediaCount?.count ?? 0,
    hasDescription: !!p.description?.trim(),
    seoTitle: p.seo?.title ?? "",
    seoDescription: p.seo?.description ?? "",
    collectionsCount: p.collections.nodes.length,
    variantsCount: p.variantsCount?.count ?? 1,
    priceMin: p.priceRangeV2?.minVariantPrice?.amount,
    priceMax: p.priceRangeV2?.maxVariantPrice?.amount,
    compareAt: p.compareAtPriceRange?.maxVariantCompareAtPrice?.amount,
    totalInventory: p.tracksInventory ? p.totalInventory : null,
    skuMissing: p.variants.nodes.some((v: any) => !v.sku),
    updatedAt: p.updatedAt,
  }));
  return { items, hasNextPage: conn.pageInfo.hasNextPage as boolean, endCursor: conn.pageInfo.endCursor as string | null };
}

// ------------------------------------------------------------------ full product

const PRODUCT_FIELDS = `
  id handle title descriptionHtml vendor productType tags status
  seo { title description }
  collections(first: 50) { nodes { id title } }
  metafields(first: 50) { nodes { namespace key value type } }
  options { name optionValues { name } }
  media(first: 100) {
    nodes {
      id alt mediaContentType
      ... on MediaImage { image { url } }
    }
  }
  variants(first: 250) {
    nodes {
      id price compareAtPrice barcode taxable inventoryPolicy
      selectedOptions { name value }
      media(first: 1) { nodes { ... on MediaImage { image { url } } } }
      inventoryItem {
        id sku tracked requiresShipping
        unitCost { amount }
        measurement { weight { value unit } }
        inventoryLevel(locationId: $locationId) { quantities(names: ["available"]) { quantity } }
      }
    }
  }
`;

export const PRODUCT_QUERY = `#graphql
  query GLProduct($id: ID!, $locationId: ID!) {
    product(id: $id) { ${PRODUCT_FIELDS} }
  }`;

export const PRODUCT_BY_HANDLE_QUERY = `#graphql
  query GLProductByHandle($handle: String!, $locationId: ID!) {
    productByIdentifier(identifier: { handle: $handle }) { ${PRODUCT_FIELDS} }
  }`;

export const PRODUCTS_PAGE_FULL_QUERY = `#graphql
  query GLProductsFull($first: Int!, $after: String, $query: String, $locationId: ID!) {
    products(first: $first, after: $after, query: $query, sortKey: TITLE) {
      pageInfo { hasNextPage endCursor }
      nodes { ${PRODUCT_FIELDS} }
    }
  }`;

export function productToDraft(p: any): ProductDraft {
  const options = (p.options ?? [])
    .map((o: any) => ({ name: o.name, values: o.optionValues.map((v: any) => v.name) }))
    .filter((o: any) => !(o.name === DEFAULT_OPTION && o.values.length === 1 && o.values[0] === DEFAULT_VALUE));
  const images: DraftImage[] = p.media.nodes
    .filter((m: any) => m.mediaContentType === "IMAGE" && m.image?.url)
    .map((m: any) => ({ src: m.image.url, alt: m.alt || undefined, mediaId: m.id }));
  return {
    id: p.id,
    handle: p.handle,
    title: p.title,
    descriptionHtml: p.descriptionHtml ?? "",
    vendor: p.vendor ?? "",
    productType: p.productType ?? "",
    tags: p.tags ?? [],
    collections: p.collections.nodes.map((c: any) => c.title),
    status: p.status as ProductStatus,
    seoTitle: p.seo?.title ?? "",
    seoDescription: p.seo?.description ?? "",
    metafields: p.metafields.nodes.map((m: any) => ({ namespace: m.namespace, key: m.key, value: m.value, type: m.type })),
    options,
    images,
    variants: p.variants.nodes.map((v: any) => {
      const w = v.inventoryItem?.measurement?.weight;
      const qty = v.inventoryItem?.inventoryLevel?.quantities?.[0]?.quantity;
      return {
        id: v.id,
        optionValues: options.length ? options.map((o: any) => v.selectedOptions.find((s: any) => s.name === o.name)?.value ?? "") : [],
        sku: v.inventoryItem?.sku ?? "",
        barcode: v.barcode ?? "",
        price: v.price ?? "",
        compareAtPrice: v.compareAtPrice ?? "",
        cost: v.inventoryItem?.unitCost?.amount ?? "",
        quantity: v.inventoryItem?.tracked ? (qty ?? 0) : null,
        weight: w?.value ?? null,
        weightUnit: w?.unit ?? "GRAMS",
        requiresShipping: v.inventoryItem?.requiresShipping ?? true,
        taxable: v.taxable ?? true,
        continueSellingWhenOutOfStock: v.inventoryPolicy === "CONTINUE",
        imageSrc: v.media?.nodes?.[0]?.image?.url,
      };
    }),
  };
}

export async function getPrimaryLocationId(admin: AdminClient): Promise<string> {
  const data = await gql(admin, `#graphql
    query GLLocations { locations(first: 10, query: "active:true") { nodes { id name fulfillsOnlineOrders } } }`);
  const nodes = data.locations.nodes;
  const loc = nodes.find((l: any) => l.fulfillsOnlineOrders) ?? nodes[0];
  if (!loc) throw new ShopifyError("No active location found in this store.");
  return loc.id;
}

export async function getProductDraft(admin: AdminClient, id: string, locationId?: string) {
  const loc = locationId ?? (await getPrimaryLocationId(admin));
  const data = await gql(admin, PRODUCT_QUERY, { id, locationId: loc });
  if (!data.product) throw new ShopifyError("Product not found");
  return productToDraft(data.product);
}

export async function getProductRawByHandle(admin: AdminClient, handle: string, locationId: string) {
  const data = await gql(admin, PRODUCT_BY_HANDLE_QUERY, { handle, locationId });
  return data.productByIdentifier as any | null;
}

/** Page through all products as drafts (used by export). */
export async function* iterateAllDrafts(admin: AdminClient, query?: string) {
  const locationId = await getPrimaryLocationId(admin);
  let after: string | null = null;
  do {
    const data: any = await gql(admin, PRODUCTS_PAGE_FULL_QUERY, { first: 10, after, query: query || null, locationId });
    for (const p of data.products.nodes) yield productToDraft(p);
    after = data.products.pageInfo.hasNextPage ? data.products.pageInfo.endCursor : null;
  } while (after);
}

// ------------------------------------------------------------------ collections

export interface CollectionInfo {
  id: string;
  title: string;
  smart: boolean;
}

export async function listCollections(admin: AdminClient): Promise<CollectionInfo[]> {
  const out: CollectionInfo[] = [];
  let after: string | null = null;
  do {
    const data: any = await gql(admin, `#graphql
      query GLCollections($after: String) {
        collections(first: 250, after: $after, sortKey: TITLE) {
          pageInfo { hasNextPage endCursor }
          nodes { id title ruleSet { appliedDisjunctively } }
        }
      }`, { after });
    for (const c of data.collections.nodes) out.push({ id: c.id, title: c.title, smart: !!c.ruleSet });
    after = data.collections.pageInfo.hasNextPage ? data.collections.pageInfo.endCursor : null;
  } while (after);
  return out;
}

// ------------------------------------------------------------------ uploads

export async function stagedUpload(admin: AdminClient, file: { buffer: Uint8Array | Blob; filename: string; mimeType: string }) {
  const data = await gql(admin, `#graphql
    mutation GLStagedUpload($input: [StagedUploadInput!]!) {
      stagedUploadsCreate(input: $input) {
        stagedTargets { url resourceUrl parameters { name value } }
        userErrors { field message }
      }
    }`, {
    input: [{
      filename: file.filename,
      mimeType: file.mimeType,
      resource: "IMAGE",
      httpMethod: "POST",
      fileSize: String(file.buffer instanceof Blob ? file.buffer.size : file.buffer.length),
    }],
  });
  const errs = data.stagedUploadsCreate.userErrors;
  if (errs.length) throw new ShopifyError(errs.map((e: any) => e.message).join("; "));
  const target = data.stagedUploadsCreate.stagedTargets[0];
  const form = new FormData();
  for (const p of target.parameters) form.append(p.name, p.value);
  form.append("file", file.buffer instanceof Blob ? file.buffer : new Blob([file.buffer as any], { type: file.mimeType }), file.filename);
  const res = await fetch(target.url, { method: "POST", body: form });
  if (!res.ok) throw new ShopifyError(`Image upload failed (${res.status})`);
  return target.resourceUrl as string;
}

export function mimeFromExt(ext: string) {
  const e = ext.toLowerCase().replace(".", "");
  return e === "jpg" || e === "jpeg" ? "image/jpeg" : e === "gif" ? "image/gif" : e === "webp" ? "image/webp" : "image/png";
}

// ------------------------------------------------------------------ save (create / update)

export const PRODUCT_SET_MUTATION = `#graphql
  mutation GLProductSet($input: ProductSetInput!, $identifier: ProductSetIdentifiers) {
    productSet(synchronous: true, input: $input, identifier: $identifier) {
      product {
        id handle status
        variants(first: 250) { nodes { id selectedOptions { name value } inventoryItem { id tracked } } }
      }
      userErrors { field message code }
    }
  }`;

export const INVENTORY_SET_MUTATION = `#graphql
  mutation GLInventorySet($input: InventorySetQuantitiesInput!) {
    inventorySetQuantities(input: $input) {
      inventoryAdjustmentGroup { id }
      userErrors { field message }
    }
  }`;

export const COLLECTION_CREATE_MUTATION = `#graphql
  mutation GLCollectionCreate($input: CollectionInput!) {
    collectionCreate(input: $input) { collection { id title } userErrors { field message } }
  }`;

export const PUBLISH_MUTATION = `#graphql
  mutation GLPublish($id: ID!, $input: [PublicationInput!]!) {
    publishablePublish(id: $id, input: $input) { userErrors { field message } }
  }`;

export interface SaveContext {
  locationId: string;
  collections: CollectionInfo[];
  onlineStorePublicationId?: string | null;
}

export async function buildSaveContext(admin: AdminClient): Promise<SaveContext> {
  const [locationId, collections, pub] = await Promise.all([
    getPrimaryLocationId(admin),
    listCollections(admin),
    gql(admin, `#graphql
      query GLPublications { publications(first: 20) { nodes { id name } } }`).catch(() => null),
  ]);
  const onlineStorePublicationId = pub?.publications?.nodes?.find((p: any) => /online store/i.test(p.name))?.id ?? null;
  return { locationId, collections, onlineStorePublicationId };
}

export interface SaveResult {
  handle: string;
  ok: boolean;
  action: "created" | "updated";
  id?: string;
  errors: string[];
  warnings: string[];
}

/** Resolve collection titles to ids, creating missing manual collections. */
async function resolveCollections(admin: AdminClient, ctx: SaveContext, titles: string[], warnings: string[]) {
  const ids: string[] = [];
  for (const raw of titles) {
    const title = raw.trim();
    if (!title) continue;
    let c = ctx.collections.find((x) => x.title.toLowerCase() === title.toLowerCase());
    if (!c) {
      const data = await gql(admin, COLLECTION_CREATE_MUTATION, { input: { title } });
      const err = data.collectionCreate.userErrors;
      if (err.length) {
        warnings.push(`Collection "${title}": ${err.map((e: any) => e.message).join("; ")}`);
        continue;
      }
      c = { id: data.collectionCreate.collection.id, title, smart: false };
      ctx.collections.push(c);
      if (ctx.onlineStorePublicationId) {
        await gql(admin, PUBLISH_MUTATION, { id: c.id, input: [{ publicationId: ctx.onlineStorePublicationId }] }).catch(() => null);
      }
    }
    if (c.smart) {
      warnings.push(`"${c.title}" is an automated (smart) collection; products join it by its rules, skipped.`);
      continue;
    }
    ids.push(c.id);
  }
  return ids;
}

export interface SaveOptions {
  /** When true, empty collections/images/metafields in the draft mean "leave unchanged" (Excel import). */
  keepWhenEmpty?: boolean;
}

export async function saveDraft(
  admin: AdminClient,
  ctx: SaveContext,
  draft: ProductDraft,
  opts: SaveOptions = {},
): Promise<SaveResult> {
  const warnings: string[] = [];
  const result: SaveResult = { handle: draft.handle, ok: false, action: "created", errors: [], warnings };
  try {
    // existing product (by id or handle)
    let existing: any = null;
    if (draft.id) {
      const d = await gql(admin, PRODUCT_QUERY, { id: draft.id, locationId: ctx.locationId });
      existing = d.product;
    }
    if (!existing && draft.handle) existing = await getProductRawByHandle(admin, draft.handle, ctx.locationId);
    result.action = existing ? "updated" : "created";

    const input: Record<string, any> = {
      title: draft.title,
      handle: draft.handle || undefined,
      status: draft.status,
      vendor: draft.vendor ?? "",
      productType: draft.productType ?? "",
      tags: draft.tags,
      seo: { title: draft.seoTitle ?? "", description: draft.seoDescription ?? "" },
    };
    if (draft.descriptionHtml !== undefined && (draft.descriptionHtml || !opts.keepWhenEmpty)) {
      input.descriptionHtml = draft.descriptionHtml;
    }
    if (opts.keepWhenEmpty && existing) {
      // don't wipe product-level text that the sheet left empty
      if (!draft.vendor) delete input.vendor;
      if (!draft.productType) delete input.productType;
      if (!draft.tags.length) delete input.tags;
      if (!draft.seoTitle && !draft.seoDescription) delete input.seo;
    }

    // collections
    if (draft.collections.length || !opts.keepWhenEmpty) {
      input.collections = await resolveCollections(admin, ctx, draft.collections, warnings);
    }

    // metafields
    if (draft.metafields.length) {
      const existingTypes = new Map<string, string>(
        (existing?.metafields?.nodes ?? []).map((m: any) => [`${m.namespace}.${m.key}`, m.type]),
      );
      input.metafields = draft.metafields
        .filter((m) => m.key && m.value !== "")
        .map((m) => ({
          namespace: m.namespace || "custom",
          key: m.key,
          value: m.value,
          type: m.type || existingTypes.get(`${m.namespace}.${m.key}`) || "single_line_text_field",
        }));
    }

    // files (images). Existing images are referenced by id so they are not re-uploaded.
    const existingByUrl = new Map<string, string>();
    for (const m of existing?.media?.nodes ?? []) {
      if (m.image?.url) existingByUrl.set(stripQuery(m.image.url), m.id);
    }
    const fileFor = (img: DraftImage) => {
      const id = img.mediaId || existingByUrl.get(stripQuery(img.src));
      return id
        ? { id, alt: img.alt ?? undefined }
        : { originalSource: img.src, alt: img.alt ?? undefined, contentType: "IMAGE" };
    };
    const images: DraftImage[] = [...draft.images];
    for (const v of draft.variants) {
      if (v.imageSrc && !images.some((im) => stripQuery(im.src) === stripQuery(v.imageSrc!))) {
        images.push({ src: v.imageSrc });
      }
    }
    const fileInputs = images.map(fileFor);
    const imagesProvided = images.length > 0 || !opts.keepWhenEmpty;
    if (imagesProvided) {
      // keep non-image media (videos, 3D) that exist on the product
      const keepOther = (existing?.media?.nodes ?? [])
        .filter((m: any) => m.mediaContentType !== "IMAGE")
        .map((m: any) => ({ id: m.id }));
      input.files = [...fileInputs, ...keepOther];
    }

    // options + variants
    const hasOptions = draft.options.length > 0;
    const options = hasOptions ? draft.options : [{ name: DEFAULT_OPTION, values: [DEFAULT_VALUE] }];
    input.productOptions = options.map((o, i) => ({
      name: o.name,
      position: i + 1,
      values: o.values.map((v) => ({ name: v })),
    }));

    const existingVariants = new Map<string, any>();
    for (const v of existing?.variants?.nodes ?? []) {
      existingVariants.set(v.selectedOptions.map((s: any) => s.value).join("|"), v);
      if (v.inventoryItem?.sku) existingVariants.set(`sku:${v.inventoryItem.sku}`, v);
    }

    const variants = hasOptions ? draft.variants : draft.variants.slice(0, 1);
    input.variants = variants.map((v, idx) => {
      const values = hasOptions ? v.optionValues : [DEFAULT_VALUE];
      const match =
        (v.id && existing?.variants?.nodes?.find((x: any) => x.id === v.id)) ||
        existingVariants.get(values.join("|")) ||
        (v.sku ? existingVariants.get(`sku:${v.sku}`) : undefined) ||
        (!hasOptions && existing?.variants?.nodes?.length === 1 ? existing.variants.nodes[0] : undefined);
      const vi: Record<string, any> = {
        optionValues: options.map((o, i) => ({ optionName: o.name, name: values[i] ?? DEFAULT_VALUE })),
        position: idx + 1,
      };
      if (match) vi.id = match.id;
      if (v.price !== undefined && v.price !== "") vi.price = v.price;
      else if (!match) vi.price = "0";
      if (v.compareAtPrice !== undefined) vi.compareAtPrice = v.compareAtPrice === "" ? null : v.compareAtPrice;
      if (v.barcode !== undefined) vi.barcode = v.barcode;
      if (v.taxable !== undefined) vi.taxable = v.taxable;
      if (v.continueSellingWhenOutOfStock !== undefined)
        vi.inventoryPolicy = v.continueSellingWhenOutOfStock ? "CONTINUE" : "DENY";
      const item: Record<string, any> = {};
      if (v.sku !== undefined) item.sku = v.sku;
      if (v.cost !== undefined && v.cost !== "") item.cost = v.cost;
      if (v.requiresShipping !== undefined) item.requiresShipping = v.requiresShipping;
      if (v.quantity !== null && v.quantity !== undefined) item.tracked = true;
      if (v.weight !== null && v.weight !== undefined)
        item.measurement = { weight: { value: Number(v.weight), unit: v.weightUnit ?? "GRAMS" } };
      if (Object.keys(item).length) vi.inventoryItem = item;
      if (v.imageSrc && imagesProvided) {
        const img = images.find((im) => stripQuery(im.src) === stripQuery(v.imageSrc!))!;
        vi.file = fileFor(img);
      }
      return vi;
    });

    const identifier = existing ? { id: existing.id } : undefined;
    const data = await gql(admin, PRODUCT_SET_MUTATION, { input, identifier });
    const ps = data.productSet;
    if (ps.userErrors?.length) {
      result.errors.push(...ps.userErrors.map((e: any) => `${(e.field ?? []).join(".")}: ${e.message}`.replace(/^: /, "")));
      return result;
    }
    const product = ps.product;
    result.id = product.id;

    // stock quantities at primary location
    const quantities: any[] = [];
    variants.forEach((v, idx) => {
      if (v.quantity === null || v.quantity === undefined) return;
      const values = hasOptions ? v.optionValues : [DEFAULT_VALUE];
      const pv =
        product.variants.nodes.find((x: any) => x.selectedOptions.map((s: any) => s.value).join("|") === values.join("|")) ??
        product.variants.nodes[idx];
      if (pv?.inventoryItem?.id) {
        quantities.push({ inventoryItemId: pv.inventoryItem.id, locationId: ctx.locationId, quantity: Number(v.quantity) });
      }
    });
    if (quantities.length) {
      const inv = await gql(admin, INVENTORY_SET_MUTATION, {
        input: { name: "available", reason: "correction", ignoreCompareQuantity: true, quantities },
      });
      const e = inv.inventorySetQuantities.userErrors;
      if (e.length) warnings.push(`Stock: ${e.map((x: any) => x.message).join("; ")}`);
    }

    // publish active products to the Online Store
    if (draft.status === "ACTIVE" && ctx.onlineStorePublicationId) {
      const pubRes = await gql(admin, PUBLISH_MUTATION, {
        id: product.id,
        input: [{ publicationId: ctx.onlineStorePublicationId }],
      }).catch((e) => ({ publishablePublish: { userErrors: [{ message: String(e.message ?? e) }] } }));
      const e = pubRes.publishablePublish.userErrors;
      if (e.length) warnings.push(`Publish: ${e.map((x: any) => x.message).join("; ")}`);
    }

    result.ok = true;
    return result;
  } catch (e: any) {
    result.errors.push(String(e?.message ?? e));
    return result;
  }
}

/** Append images to an existing product (bulk image upload). */
export async function appendImages(admin: AdminClient, productId: string, images: { src: string; alt?: string }[]) {
  const data = await gql(admin, `#graphql
    mutation GLAppendMedia($product: ProductUpdateInput!, $media: [CreateMediaInput!]) {
      productUpdate(product: $product, media: $media) {
        product { id }
        userErrors { field message }
      }
    }`, {
    product: { id: productId },
    media: images.map((i) => ({ originalSource: i.src, alt: i.alt ?? "", mediaContentType: "IMAGE" })),
  });
  const e = data.productUpdate.userErrors;
  if (e.length) throw new ShopifyError(e.map((x: any) => x.message).join("; "));
}

/** Find a product id by handle or variant SKU (bulk image matching). */
export async function findProductForImage(admin: AdminClient, key: string): Promise<{ id: string; title: string; handle: string } | null> {
  const found = await findProductExact(admin, key);
  if (found) return found;
  const stripped = key.replace(/-\d{1,2}$/, "");
  return stripped !== key ? findProductExact(admin, stripped) : null;
}

async function findProductExact(admin: AdminClient, key: string) {
  const byHandle = await gql(admin, `#graphql
    query GLFindHandle($handle: String!) { productByIdentifier(identifier: { handle: $handle }) { id title handle } }`, { handle: key });
  if (byHandle.productByIdentifier) return byHandle.productByIdentifier as { id: string; title: string; handle: string };
  const bySku = await gql(admin, `#graphql
    query GLFindSku($q: String!) { productVariants(first: 1, query: $q) { nodes { product { id title handle } } } }`, {
    q: `sku:"${key.replace(/"/g, "")}"`,
  });
  return (bySku.productVariants.nodes[0]?.product ?? null) as { id: string; title: string; handle: string } | null;
}

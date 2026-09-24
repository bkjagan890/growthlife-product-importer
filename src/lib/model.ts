// Shared, platform-neutral product model used by the editor popup,
// the Excel/CSV importer and the exporter.

export type ProductStatus = "ACTIVE" | "DRAFT" | "ARCHIVED";

export interface DraftImage {
  src: string; // public URL or staged-upload resourceUrl
  alt?: string;
  mediaId?: string; // existing Shopify MediaImage id (keeps it instead of re-uploading)
}

export interface DraftMetafield {
  namespace: string;
  key: string;
  value: string;
  type?: string; // defaults to single_line_text_field
}

export interface DraftOption {
  name: string;
  values: string[];
}

export interface DraftVariant {
  id?: string;
  optionValues: string[]; // same order as product options
  sku?: string;
  barcode?: string;
  price?: string; // selling / sale price
  compareAtPrice?: string; // regular price / MRP (shown struck through)
  cost?: string;
  quantity?: number | null;
  weight?: number | null;
  weightUnit?: "GRAMS" | "KILOGRAMS" | "POUNDS" | "OUNCES";
  requiresShipping?: boolean;
  taxable?: boolean;
  continueSellingWhenOutOfStock?: boolean;
  imageSrc?: string;
}

export interface ProductDraft {
  id?: string;
  handle: string;
  title: string;
  descriptionHtml?: string;
  vendor?: string;
  productType?: string;
  tags: string[];
  collections: string[]; // collection titles
  status: ProductStatus;
  seoTitle?: string;
  seoDescription?: string;
  metafields: DraftMetafield[];
  options: DraftOption[];
  variants: DraftVariant[];
  images: DraftImage[];
}

export const DEFAULT_OPTION = "Title";
export const DEFAULT_VALUE = "Default Title";

export function emptyDraft(): ProductDraft {
  return {
    handle: "",
    title: "",
    descriptionHtml: "",
    vendor: "",
    productType: "",
    tags: [],
    collections: [],
    status: "DRAFT",
    seoTitle: "",
    seoDescription: "",
    metafields: [],
    options: [],
    variants: [{ optionValues: [], price: "0" }],
    images: [],
  };
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 200);
}

/** Every combination of option values, in order. */
export function cartesian(options: DraftOption[]): string[][] {
  const usable = options.filter((o) => o.name.trim() && o.values.length);
  if (!usable.length) return [[]];
  return usable.reduce<string[][]>(
    (acc, opt) => acc.flatMap((combo) => opt.values.map((v) => [...combo, v])),
    [[]],
  );
}

/**
 * Rebuild the variant list after options change, keeping the data of any
 * variant whose option combination still exists.
 */
export function regenerateVariants(
  options: DraftOption[],
  existing: DraftVariant[],
): DraftVariant[] {
  const combos = cartesian(options);
  const byKey = new Map(existing.map((v) => [v.optionValues.join(" / "), v]));
  const template = existing[0] ?? { optionValues: [] };
  return combos.map((combo) => {
    const found = byKey.get(combo.join(" / "));
    if (found) return { ...found, optionValues: combo };
    return {
      optionValues: combo,
      price: template.price,
      compareAtPrice: template.compareAtPrice,
      cost: template.cost,
      weight: template.weight,
      weightUnit: template.weightUnit,
      requiresShipping: template.requiresShipping,
      taxable: template.taxable,
      quantity: 0,
    };
  });
}

export interface CompletenessResult {
  complete: boolean;
  score: number; // 0-100
  missing: string[];
}

export interface ProductSummary {
  id: string;
  handle: string;
  title: string;
  status: ProductStatus;
  vendor: string;
  productType: string;
  tags: string[];
  image?: string;
  imageCount: number;
  hasDescription: boolean;
  seoTitle?: string;
  seoDescription?: string;
  collectionsCount: number;
  variantsCount: number;
  priceMin?: string;
  priceMax?: string;
  compareAt?: string;
  totalInventory: number | null;
  skuMissing: boolean;
  updatedAt: string;
}

/** Which important fields are still empty on a product. */
export function checkCompleteness(p: ProductSummary): CompletenessResult {
  const checks: [string, boolean][] = [
    ["Title", !!p.title?.trim()],
    ["Description", p.hasDescription],
    ["Image", p.imageCount > 0],
    ["Price", !!p.priceMin && Number(p.priceMin) > 0],
    ["MRP (higher than sale price)", !!p.compareAt && Number(p.compareAt) > Number(p.priceMin ?? 0)],
    ["SKU", !p.skuMissing],
    ["Stock quantity", p.totalInventory !== null && p.totalInventory > 0],
    ["Vendor", !!p.vendor?.trim()],
    ["Product type", !!p.productType?.trim()],
    ["Tags", p.tags.length > 0],
    ["Collection", p.collectionsCount > 0],
    ["SEO title", !!p.seoTitle?.trim()],
    ["SEO description", !!p.seoDescription?.trim()],
  ];
  const missing = checks.filter(([, ok]) => !ok).map(([name]) => name);
  return {
    complete: missing.length === 0,
    score: Math.round(((checks.length - missing.length) / checks.length) * 100),
    missing,
  };
}

// ------------------------------------------------------------------ audits on full product data

const plainText = (html?: string) => (html ?? "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

/** Turn a full product draft into the summary used by the grid (same completeness rules). */
export function draftToSummary(d: ProductDraft): ProductSummary {
  const prices = d.variants.map((v) => Number(v.price)).filter((n) => !isNaN(n));
  const compare = d.variants.map((v) => Number(v.compareAtPrice)).filter((n) => !isNaN(n) && n > 0);
  const tracked = d.variants.filter((v) => v.quantity !== null && v.quantity !== undefined);
  return {
    id: d.id ?? "",
    handle: d.handle,
    title: d.title,
    status: d.status,
    vendor: d.vendor ?? "",
    productType: d.productType ?? "",
    tags: d.tags,
    imageCount: d.images.length,
    hasDescription: !!plainText(d.descriptionHtml),
    seoTitle: d.seoTitle,
    seoDescription: d.seoDescription,
    collectionsCount: d.collections.length,
    variantsCount: d.variants.length,
    priceMin: prices.length ? String(Math.min(...prices)) : undefined,
    priceMax: prices.length ? String(Math.max(...prices)) : undefined,
    compareAt: compare.length ? String(Math.max(...compare)) : undefined,
    totalInventory: tracked.length ? tracked.reduce((s, v) => s + Number(v.quantity || 0), 0) : null,
    skuMissing: d.variants.some((v) => !v.sku?.trim()),
    updatedAt: "",
  };
}

export interface AdsAudit {
  ready: boolean;
  critical: string[]; // blocks good ads / shopping feeds
  recommended: string[]; // improves ads quality
}

/** What is missing for running ads / Google Shopping / Meta catalog on this product. */
export function auditForAds(d: ProductDraft): AdsAudit {
  const critical: string[] = [];
  const recommended: string[] = [];
  const text = plainText(d.descriptionHtml);
  const prices = d.variants.map((v) => Number(v.price) || 0);
  const realOptions = d.options.filter((o) => !(o.name === DEFAULT_OPTION && o.values.length <= 1));
  const attributes = d.metafields.filter((m) => m.value?.trim() && !m.namespace.startsWith("global") && !m.namespace.startsWith("shopify"));

  if (d.status !== "ACTIVE") critical.push(`Status is ${d.status.toLowerCase()} (not live)`);
  if (d.title.trim().length < 15) critical.push("Title too short (under 15 characters)");
  if (!text) critical.push("Description missing");
  else if (text.length < 100) critical.push(`Description too short (${text.length} characters, need 100+)`);
  if (d.images.length === 0) critical.push("No images");
  if (prices.some((p) => p <= 0)) critical.push("Price is 0 on some variant");
  const stockOk = d.variants.some((v) => v.quantity === null || v.quantity === undefined || Number(v.quantity) > 0 || v.continueSellingWhenOutOfStock);
  if (!stockOk) critical.push("Out of stock");
  if (d.variants.some((v) => !v.sku?.trim())) critical.push("SKU missing");
  if (!d.vendor?.trim()) critical.push("Brand / vendor missing");
  if (!d.productType?.trim()) critical.push("Product type / category missing");
  if (!realOptions.length && !attributes.length) critical.push("No attributes (no variants/options and no metafields like material, size, colour)");
  if (d.variants.some((v) => v.compareAtPrice && Number(v.compareAtPrice) > 0 && Number(v.compareAtPrice) < Number(v.price)))
    critical.push("MRP lower than sale price (wrong discount)");

  if (d.images.length > 0 && d.images.length < 3) recommended.push(`Only ${d.images.length} image(s), 3+ recommended`);
  if (d.variants.some((v) => !v.barcode?.trim())) recommended.push("Barcode / GTIN missing");
  if (!d.variants.some((v) => v.compareAtPrice && Number(v.compareAtPrice) > Number(v.price))) recommended.push("No MRP / discount shown");
  if (!d.seoTitle?.trim()) recommended.push("SEO title missing");
  if (!d.seoDescription?.trim()) recommended.push("SEO description missing");
  if (!d.collections.length) recommended.push("Not in any collection");
  if (!d.tags.length) recommended.push("No tags");
  if (d.images.some((im) => !im.alt?.trim())) recommended.push("Image alt text missing");

  return { ready: critical.length === 0, critical, recommended };
}

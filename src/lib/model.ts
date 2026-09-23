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
    ["Sale/MRP price", !!p.compareAt && Number(p.compareAt) > 0],
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

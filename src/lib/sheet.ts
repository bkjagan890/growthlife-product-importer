// Pure spreadsheet <-> ProductDraft mapping (no Shopify, no file I/O).
// One row per variant. Product-level columns only need to be filled on the
// first row of each Handle; extra rows with the same Handle add variants.

import {
  DEFAULT_OPTION,
  DEFAULT_VALUE,
  slugify,
  type DraftVariant,
  type ProductDraft,
  type ProductStatus,
} from "./model";

export interface ColumnDef {
  key: string;
  header: string;
  help: string;
  width: number;
  level: "product" | "variant" | "image";
  required?: boolean;
}

export const COLUMNS: ColumnDef[] = [
  { key: "handle", header: "Handle", level: "product", width: 26, required: true,
    help: "REQUIRED. Unique product URL id, e.g. red-cotton-tshirt. Same handle on several rows = one product with several variants. Existing handle = update, new handle = create." },
  { key: "title", header: "Title", level: "product", width: 34, required: true,
    help: "REQUIRED on first row of the product. Product name." },
  { key: "description", header: "Description (HTML)", level: "product", width: 44,
    help: "Product description. Plain text or HTML like <p>Soft cotton</p><ul><li>Point</li></ul>." },
  { key: "vendor", header: "Vendor / Brand", level: "product", width: 18, help: "Brand or manufacturer name." },
  { key: "productType", header: "Product Type", level: "product", width: 18, help: "Your own category, e.g. T-Shirt, Drill Machine." },
  { key: "tags", header: "Tags", level: "product", width: 26, help: "Comma separated: summer, cotton, new-arrival" },
  { key: "collections", header: "Collections", level: "product", width: 26,
    help: "Comma separated collection names. Missing manual collections are created automatically." },
  { key: "status", header: "Status", level: "product", width: 10, help: "active, draft or archived (default: draft). Active products are published to the Online Store." },
  { key: "seoTitle", header: "SEO Meta Title", level: "product", width: 30, help: "Google title, ideally under 70 characters." },
  { key: "seoDescription", header: "SEO Meta Description", level: "product", width: 40, help: "Google description, ideally under 160 characters." },
  { key: "metafields", header: "Metafields / Attributes", level: "product", width: 34,
    help: "Extra attributes as namespace.key=value separated by | e.g. custom.material=Cotton | custom.warranty=1 Year" },
  { key: "option1Name", header: "Option1 Name", level: "variant", width: 14, help: "e.g. Size. Leave empty for a product without variants." },
  { key: "option1Value", header: "Option1 Value", level: "variant", width: 14, help: "e.g. M" },
  { key: "option2Name", header: "Option2 Name", level: "variant", width: 14, help: "e.g. Color" },
  { key: "option2Value", header: "Option2 Value", level: "variant", width: 14, help: "e.g. Red" },
  { key: "option3Name", header: "Option3 Name", level: "variant", width: 14, help: "e.g. Material" },
  { key: "option3Value", header: "Option3 Value", level: "variant", width: 14, help: "e.g. Cotton" },
  { key: "sku", header: "SKU", level: "variant", width: 16, help: "Stock keeping unit, unique per variant." },
  { key: "barcode", header: "Barcode", level: "variant", width: 16, help: "EAN / UPC / ISBN" },
  { key: "price", header: "Sale Price", level: "variant", width: 12, help: "Price the customer pays, e.g. 499" },
  { key: "compareAtPrice", header: "Regular Price / MRP", level: "variant", width: 14, help: "Original price shown crossed out, e.g. 999. Must be higher than Sale Price." },
  { key: "cost", header: "Cost per Item", level: "variant", width: 12, help: "Your purchase cost (hidden from customers)." },
  { key: "quantity", header: "Quantity", level: "variant", width: 10, help: "Stock available at your main location." },
  { key: "weight", header: "Weight", level: "variant", width: 10, help: "Number only, e.g. 250" },
  { key: "weightUnit", header: "Weight Unit", level: "variant", width: 10, help: "g, kg, lb or oz (default g)" },
  { key: "requiresShipping", header: "Requires Shipping", level: "variant", width: 10, help: "yes / no (default yes)" },
  { key: "taxable", header: "Taxable", level: "variant", width: 9, help: "yes / no (default yes)" },
  { key: "continueSelling", header: "Sell When Out of Stock", level: "variant", width: 12, help: "yes / no (default no)" },
  { key: "variantImage", header: "Variant Image URL", level: "variant", width: 30, help: "Image URL shown when this variant is selected." },
  { key: "imageUrls", header: "Image URLs", level: "image", width: 44,
    help: "Product images, comma separated URLs. FIRST image = thumbnail / featured image." },
  { key: "imageAlt", header: "Image Alt Text", level: "image", width: 22, help: "Alt text for the images in this row (SEO)." },
  { key: "embeddedImages", header: "Paste Images Here", level: "image", width: 20,
    help: "Insert > Picture (Place in Cell / over cell) in this column. Pictures are uploaded on import and added after the URL images." },
  { key: "thumbnail", header: "Thumbnail Preview", level: "image", width: 14, help: "Preview only (exported). Ignored on import." },
];

export const HELP_PREFIX = "ℹ ";
export const HEADER_BY_KEY = Object.fromEntries(COLUMNS.map((c) => [c.key, c.header]));

const aliases: Record<string, string> = {};
for (const c of COLUMNS) aliases[norm(c.header)] = c.key;
// Accept Shopify's own CSV headers and common variations too.
Object.assign(aliases, {
  [norm("Body (HTML)")]: "description",
  [norm("Description")]: "description",
  [norm("Vendor")]: "vendor",
  [norm("Type")]: "productType",
  [norm("Product Category")]: "productType",
  [norm("Collection")]: "collections",
  [norm("SEO Title")]: "seoTitle",
  [norm("SEO Description")]: "seoDescription",
  [norm("Meta Title")]: "seoTitle",
  [norm("Meta Description")]: "seoDescription",
  [norm("Variant SKU")]: "sku",
  [norm("Variant Barcode")]: "barcode",
  [norm("Variant Price")]: "price",
  [norm("Price")]: "price",
  [norm("Variant Compare At Price")]: "compareAtPrice",
  [norm("Compare At Price")]: "compareAtPrice",
  [norm("MRP")]: "compareAtPrice",
  [norm("Regular Price")]: "compareAtPrice",
  [norm("Cost per item")]: "cost",
  [norm("Variant Inventory Qty")]: "quantity",
  [norm("Stock")]: "quantity",
  [norm("Variant Grams")]: "weight",
  [norm("Variant Weight Unit")]: "weightUnit",
  [norm("Variant Requires Shipping")]: "requiresShipping",
  [norm("Variant Taxable")]: "taxable",
  [norm("Variant Image")]: "variantImage",
  [norm("Image Src")]: "imageUrls",
  [norm("Images")]: "imageUrls",
  [norm("Image URL")]: "imageUrls",
  [norm("Image Alt Text")]: "imageAlt",
});

function norm(s: string): string {
  return String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function headerToKey(header: string): string | undefined {
  return aliases[norm(header)];
}

export type SheetRow = Record<string, string>;

const splitList = (v?: string) =>
  (v ?? "")
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean);

function yesNo(v: string | undefined, dflt: boolean): boolean {
  const s = (v ?? "").trim().toLowerCase();
  if (!s) return dflt;
  return ["yes", "y", "true", "1", "haan", "ha"].includes(s);
}

function num(v?: string): string | undefined {
  const s = (v ?? "").toString().replace(/[₹$,\s]/g, "").trim();
  if (!s) return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? String(n) : undefined;
}

const UNIT: Record<string, DraftVariant["weightUnit"]> = {
  g: "GRAMS", gm: "GRAMS", gram: "GRAMS", grams: "GRAMS",
  kg: "KILOGRAMS", kgs: "KILOGRAMS", kilogram: "KILOGRAMS", kilograms: "KILOGRAMS",
  lb: "POUNDS", lbs: "POUNDS", pound: "POUNDS", pounds: "POUNDS",
  oz: "OUNCES", ounce: "OUNCES", ounces: "OUNCES",
};
const UNIT_SHORT: Record<string, string> = { GRAMS: "g", KILOGRAMS: "kg", POUNDS: "lb", OUNCES: "oz" };

export function parseMetafields(v?: string) {
  return (v ?? "")
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const eq = part.indexOf("=");
      if (eq < 0) return null;
      const path = part.slice(0, eq).trim();
      const value = part.slice(eq + 1).trim();
      const dot = path.lastIndexOf(".");
      const namespace = dot > 0 ? path.slice(0, dot).trim() : "custom";
      const key = (dot > 0 ? path.slice(dot + 1) : path).trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_");
      if (!key || !value) return null;
      return { namespace, key, value };
    })
    .filter((m): m is { namespace: string; key: string; value: string } => !!m);
}

export interface RowIssue {
  row: number; // spreadsheet row number
  handle: string;
  message: string;
}

export interface ParsedSheet {
  drafts: ProductDraft[];
  issues: RowIssue[];
  /** spreadsheet row numbers belonging to each handle (for embedded images) */
  rowsByHandle: Record<string, number[]>;
}

/**
 * Convert spreadsheet rows into product drafts.
 * `rows[i].__row` may hold the real spreadsheet row number for messages.
 */
export function rowsToDrafts(rows: (SheetRow & { __row?: string })[]): ParsedSheet {
  const issues: RowIssue[] = [];
  const map = new Map<string, ProductDraft>();
  const rowsByHandle: Record<string, number[]> = {};
  let lastHandle = "";

  rows.forEach((row, i) => {
    const rowNo = Number(row.__row ?? i + 1);
    const isEmpty = COLUMNS.every((c) => !(row[c.key] ?? "").toString().trim());
    if (isEmpty) return;

    let handle = (row.handle ?? "").trim();
    if (!handle && row.title?.trim()) handle = slugify(row.title);
    if (!handle) handle = lastHandle; // continuation row
    if (!handle) {
      issues.push({ row: rowNo, handle: "", message: "Row has no Handle or Title, skipped." });
      return;
    }
    handle = slugify(handle) || handle;
    lastHandle = handle;
    (rowsByHandle[handle] ||= []).push(rowNo);

    let d = map.get(handle);
    if (!d) {
      d = {
        handle,
        title: "",
        tags: [],
        collections: [],
        status: "DRAFT",
        metafields: [],
        options: [],
        variants: [],
        images: [],
      };
      map.set(handle, d);
    }

    // product-level: first non-empty value wins
    const setOnce = <K extends keyof ProductDraft>(k: K, v: ProductDraft[K] | undefined) => {
      if (v === undefined || v === "" || (Array.isArray(v) && !v.length)) return;
      const cur = d![k];
      if (cur === undefined || cur === "" || (Array.isArray(cur) && !cur.length)) d![k] = v;
    };
    setOnce("title", row.title?.trim());
    setOnce("descriptionHtml", row.description?.trim());
    setOnce("vendor", row.vendor?.trim());
    setOnce("productType", row.productType?.trim());
    setOnce("tags", splitList(row.tags));
    setOnce("collections", splitList(row.collections));
    setOnce("seoTitle", row.seoTitle?.trim());
    setOnce("seoDescription", row.seoDescription?.trim());
    if (row.status?.trim()) {
      const s = row.status.trim().toUpperCase();
      if (s === "ACTIVE" || s === "DRAFT" || s === "ARCHIVED") d.status = s as ProductStatus;
      else issues.push({ row: rowNo, handle, message: `Unknown status "${row.status}", using draft.` });
    }
    for (const m of parseMetafields(row.metafields)) {
      if (!d.metafields.some((x) => x.namespace === m.namespace && x.key === m.key)) d.metafields.push(m);
    }

    // images
    const alt = row.imageAlt?.trim() || undefined;
    for (const src of splitList(row.imageUrls)) {
      if (!/^https?:\/\//i.test(src)) {
        issues.push({ row: rowNo, handle, message: `Image "${src}" is not a URL, skipped.` });
        continue;
      }
      if (!d.images.some((im) => im.src === src)) d.images.push({ src, alt });
    }

    // options (names from the first row that has them)
    for (let n = 1; n <= 3; n++) {
      const name = row[`option${n}Name`]?.trim();
      if (name && !d.options[n - 1]) d.options[n - 1] = { name, values: [] };
    }

    // variant: a row is a variant row if it has any variant-level data
    const hasVariantData = COLUMNS.some(
      (c) => c.level === "variant" && (row[c.key] ?? "").toString().trim(),
    );
    if (!hasVariantData) return;

    const optionValues: string[] = [];
    for (let n = 1; n <= 3; n++) {
      const val = row[`option${n}Value`]?.trim();
      if (val) {
        if (!d.options[n - 1]) d.options[n - 1] = { name: `Option ${n}`, values: [] };
        optionValues[n - 1] = val;
      }
    }
    const price = num(row.price);
    const compareAt = num(row.compareAtPrice);
    if (row.price?.trim() && price === undefined)
      issues.push({ row: rowNo, handle, message: `Sale Price "${row.price}" is not a number.` });
    if (price && compareAt && Number(compareAt) <= Number(price))
      issues.push({ row: rowNo, handle, message: `MRP ${compareAt} is not higher than Sale Price ${price}; it will not show as a discount.` });

    const qtyStr = (row.quantity ?? "").toString().trim();
    const weightStr = num(row.weight);
    d.variants.push({
      optionValues,
      sku: row.sku?.trim() || undefined,
      barcode: row.barcode?.trim() || undefined,
      price,
      compareAtPrice: compareAt,
      cost: num(row.cost),
      quantity: qtyStr === "" ? null : Math.trunc(Number(qtyStr)) || 0,
      weight: weightStr ? Number(weightStr) : null,
      weightUnit: UNIT[(row.weightUnit ?? "").trim().toLowerCase()] ?? "GRAMS",
      requiresShipping: yesNo(row.requiresShipping, true),
      taxable: yesNo(row.taxable, true),
      continueSellingWhenOutOfStock: yesNo(row.continueSelling, false),
      imageSrc: /^https?:\/\//i.test(row.variantImage ?? "") ? row.variantImage!.trim() : undefined,
    });
  });

  // finalise
  for (const d of map.values()) {
    if (!d.title) {
      issues.push({ row: rowsByHandle[d.handle]?.[0] ?? 0, handle: d.handle, message: "Missing Title, using handle as title." });
      d.title = d.handle.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    }
    d.options = d.options.filter(Boolean);
    if (!d.variants.length) d.variants.push({ optionValues: [] });
    // fill option value lists (keep first-seen order) and pad missing values
    d.options.forEach((opt, idx) => {
      for (const v of d.variants) {
        if (!v.optionValues[idx]) v.optionValues[idx] = d.variants.length === 1 ? DEFAULT_VALUE : "-";
        if (!opt.values.includes(v.optionValues[idx])) opt.values.push(v.optionValues[idx]);
      }
    });
    // duplicate variant combos
    const seen = new Set<string>();
    d.variants = d.variants.filter((v) => {
      const k = v.optionValues.join("|");
      if (seen.has(k)) {
        issues.push({ row: rowsByHandle[d.handle]?.[0] ?? 0, handle: d.handle, message: `Duplicate variant "${k || DEFAULT_VALUE}" ignored.` });
        return false;
      }
      seen.add(k);
      return true;
    });
    if (d.options.length === 0 && d.variants.length > 1) {
      issues.push({ row: rowsByHandle[d.handle]?.[0] ?? 0, handle: d.handle, message: "Several rows without option values; only the first is used." });
      d.variants = d.variants.slice(0, 1);
    }
  }

  return { drafts: [...map.values()], issues, rowsByHandle };
}

/** Convert drafts into spreadsheet rows (one per variant). */
export function draftsToRows(drafts: ProductDraft[]): SheetRow[] {
  const rows: SheetRow[] = [];
  for (const d of drafts) {
    const variants = d.variants.length ? d.variants : [{ optionValues: [] } as DraftVariant];
    const realOptions = d.options.filter(
      (o) => !(o.name === DEFAULT_OPTION && o.values.length === 1 && o.values[0] === DEFAULT_VALUE),
    );
    variants.forEach((v, i) => {
      const first = i === 0;
      const r: SheetRow = { handle: d.handle };
      if (first) {
        Object.assign(r, {
          title: d.title ?? "",
          description: d.descriptionHtml ?? "",
          vendor: d.vendor ?? "",
          productType: d.productType ?? "",
          tags: d.tags.join(", "),
          collections: d.collections.join(", "),
          status: (d.status ?? "DRAFT").toLowerCase(),
          seoTitle: d.seoTitle ?? "",
          seoDescription: d.seoDescription ?? "",
          metafields: d.metafields.map((m) => `${m.namespace}.${m.key}=${m.value}`).join(" | "),
          imageUrls: d.images.map((im) => im.src).join(", "),
          imageAlt: d.images.find((im) => im.alt)?.alt ?? "",
        });
      }
      realOptions.forEach((o, idx) => {
        if (first) r[`option${idx + 1}Name`] = o.name;
        r[`option${idx + 1}Value`] = v.optionValues[idx] ?? "";
      });
      Object.assign(r, {
        sku: v.sku ?? "",
        barcode: v.barcode ?? "",
        price: v.price ?? "",
        compareAtPrice: v.compareAtPrice ?? "",
        cost: v.cost ?? "",
        quantity: v.quantity == null ? "" : String(v.quantity),
        weight: v.weight == null ? "" : String(v.weight),
        weightUnit: v.weight == null ? "" : UNIT_SHORT[v.weightUnit ?? "GRAMS"],
        requiresShipping: v.requiresShipping === false ? "no" : "yes",
        taxable: v.taxable === false ? "no" : "yes",
        continueSelling: v.continueSellingWhenOutOfStock ? "yes" : "no",
        variantImage: v.imageSrc ?? "",
      });
      rows.push(r);
    });
  }
  return rows;
}

/** Example rows used in the blank template. */
export const SAMPLE_ROWS: SheetRow[] = draftsToRows([
  {
    handle: "classic-cotton-tshirt",
    title: "Classic Cotton T-Shirt",
    descriptionHtml: "<p>100% cotton, breathable and soft.</p>",
    vendor: "GrowthLife",
    productType: "T-Shirt",
    tags: ["cotton", "summer"],
    collections: ["Men", "New Arrivals"],
    status: "ACTIVE",
    seoTitle: "Classic Cotton T-Shirt | Soft & Breathable",
    seoDescription: "Buy the classic 100% cotton t-shirt in 3 colours and all sizes.",
    metafields: [{ namespace: "custom", key: "material", value: "Cotton" }],
    options: [
      { name: "Size", values: ["M", "L"] },
      { name: "Color", values: ["Red", "Black"] },
    ],
    variants: [
      { optionValues: ["M", "Red"], sku: "TS-M-RED", price: "499", compareAtPrice: "999", quantity: 25, weight: 200, weightUnit: "GRAMS" },
      { optionValues: ["M", "Black"], sku: "TS-M-BLK", price: "499", compareAtPrice: "999", quantity: 10, weight: 200, weightUnit: "GRAMS" },
      { optionValues: ["L", "Red"], sku: "TS-L-RED", price: "549", compareAtPrice: "1099", quantity: 5, weight: 220, weightUnit: "GRAMS" },
    ],
    images: [
      { src: "https://example.com/images/tshirt-front.jpg", alt: "Classic Cotton T-Shirt" },
      { src: "https://example.com/images/tshirt-back.jpg" },
    ],
  },
  {
    handle: "steel-hammer-500g",
    title: "Steel Hammer 500g",
    descriptionHtml: "Forged steel head with anti-slip grip.",
    vendor: "Implemental",
    productType: "Hand Tools",
    tags: ["tools"],
    collections: ["Hand Tools"],
    status: "DRAFT",
    seoTitle: "",
    seoDescription: "",
    metafields: [],
    options: [],
    variants: [{ optionValues: [], sku: "HM-500", price: "349", compareAtPrice: "450", quantity: 100, weight: 0.5, weightUnit: "KILOGRAMS" }],
    images: [{ src: "https://example.com/images/hammer.jpg" }],
  },
]);

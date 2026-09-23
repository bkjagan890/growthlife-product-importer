# GrowthLife Product Importer (Shopify app)

Bulk import, export and edit every Shopify product from one screen.

## Features
- **All Products page**: every product on one page with thumbnail, status, sale price / MRP, stock, variants and a completeness score.
  - Search by title, handle, vendor, type or tag.
  - Tabs: All · ✓ Complete · Needs details · Active · Draft · Archived, plus a "Missing: …" filter (for example, missing images or SEO description).
  - Click a product to open a **popup editor** where you can edit everything: title, HTML description, handle, status, vendor, type, tags, collections (and create new ones), SEO meta title/description with a Google preview, metafields and attributes, options (Size/Color/…), an auto-generated variant grid (sale price, MRP, cost, qty, SKU, barcode, weight, variant image), images (drag & drop upload, add by URL, reorder, set thumbnail, alt text), tax, shipping and sell-when-out-of-stock.
- **Export** to `.xlsx` (or `.csv`) with all data: a title banner, a how-to row, colour-coded headers, a help row explaining every column, dropdowns and a *Guide* sheet. Optional thumbnail pictures are embedded in the Excel file.
- **Import** `.xlsx` / `.csv` (Shopify's own product CSV works too). Existing handles are updated and new handles are created, including variants, options, sale price, MRP, cost, stock, SKU, barcode, weight, collections (missing ones are created), tags, SEO, metafields and images.
  - Images can be URLs (the first one is the thumbnail) **or pictures pasted into the Excel sheet** ("Paste Images Here" column; both floating pictures and Excel 365 *Place in Cell* pictures are supported). They are uploaded to Shopify automatically.
  - Shows a preview with warnings, runs in batches with a progress bar, and lets you download a result report.
- **Bulk image upload**: drop hundreds of images named by handle or SKU (`red-shirt.jpg`, `red-shirt_2.jpg`, `TS-M-RED.png`), and they are added to the matching products.
- Active products are published to the Online Store sales channel automatically.

## Run it (first time)
```bash
npm install
npm run dev          # shopify app dev: log in, create/link the app, pick a dev store
```
When the CLI asks, choose **Create a new app** and name it `GrowthLife Product Importer`. The scopes are already in `shopify.app.toml`.

To use it on a live store (not a dev store), deploy it (for example to Render, Railway or Fly.io; there is a `Dockerfile`), set `SHOPIFY_APP_URL`, run `npm run deploy`, then install it with **Custom distribution** from the Partner Dashboard / Dev Dashboard.

## Checks
```bash
npm test             # spreadsheet mapping, xlsx/csv round-trip, pasted-image detection
npm run typecheck
npm run lint
npm run build
```

## Code map
| File | Purpose |
|---|---|
| `app/lib/model.ts` | Product draft model, variant generation, completeness rules |
| `app/lib/sheet.ts` | Column definitions and help text; rows ⇄ products |
| `app/lib/xlsx.server.ts` | Excel/CSV writer and reader (including embedded pictures) |
| `app/lib/shopify-products.server.ts` | Admin GraphQL (2025-10): list, load, `productSet` save, stock, collections, publish, uploads |
| `app/routes/app._index.tsx` | All-products page |
| `app/components/ProductEditor.tsx` | Single-click popup editor |
| `app/routes/app.import.tsx` / `app.export.tsx` / `app.images.tsx` | Import, export and bulk images pages |
| `app/routes/app.api.*.tsx` | JSON/file endpoints used by the pages |

# GrowthLife Product Importer

A free Shopify app for bulk importing, exporting and editing every product from one screen.

**It doesn't need a server, a database or an API secret.** The app is a static page hosted on GitHub Pages. Shopify loads it inside the admin, and App Bridge [Direct API access](https://shopify.dev/docs/api/app-bridge-library#direct-api-access) lets it call the Shopify Admin API straight from the browser.

## Features
- **All Products page:** every product on one page with thumbnail, status, sale price / MRP, stock, variants and a completeness score.
  - Search, tabs (All · ✓ Complete · Needs details · Active · Draft · Archived) and a "Missing: …" filter.
  - Click a product to edit everything in one popup: title, HTML description, handle, status, vendor, type, tags, collections (new ones are created), SEO meta with a Google preview, metafields, options, and a variant grid (sale price, MRP, cost, qty, SKU, barcode, weight, variant image). You can also upload, reorder and set the thumbnail image, add alt text, and set tax / shipping / sell-when-out-of-stock.
- **Export:** `.xlsx` or `.csv` with every product field. The file has a title row, a how-to row, colour-coded headers, a help row for each column, dropdowns and a *Guide* sheet. Thumbnails in Excel are optional.
- **Import:** `.xlsx` / `.csv` (Shopify's CSV format also works). Existing handles are updated and new ones are created, with variants, options, prices, stock, collections, tags, SEO, metafields and images.
  - Images can be URLs, or **pictures pasted inside Excel** (floating or *Place in Cell*).
- **Bulk image upload:** drop images named by handle or SKU (`red-shirt.jpg`, `red-shirt_2.jpg`, `TS-M-RED.png`).

## How it's deployed
- `main` branch → GitHub Actions (`.github/workflows/pages.yml`) runs the tests, builds and publishes to GitHub Pages.
- Shopify app config: `shopify.app.toml` (App URL = the Pages URL, `[access.admin] embedded_app_direct_api_access = true`).
- The public Client ID is in `.env` (`VITE_SHOPIFY_API_KEY`). It isn't a secret.

## Develop
```bash
npm install
npm test        # spreadsheet mapping, xlsx/csv round-trip, pasted pictures
npm run build   # typecheck + production build into dist/
```

## Code map
| Path | Purpose |
|---|---|
| `src/lib/shopify.ts` | Admin GraphQL (2025-10) via direct API access: list, load, `productSet` save, stock, collections, publish, uploads |
| `src/lib/actions.ts` | Import / export / save / upload flows used by the pages |
| `src/lib/sheet.ts` | Column definitions + help text; rows ⇄ products |
| `src/lib/xlsx.ts` | Excel/CSV writer and reader (including embedded pictures) |
| `src/lib/model.ts` | Product model, variant generation, completeness rules |
| `src/pages/*` | All Products, Import, Export, Bulk Image Upload |
| `src/components/ProductEditor.tsx` | Single-click popup editor |

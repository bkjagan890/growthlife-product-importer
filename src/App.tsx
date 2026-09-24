import { useEffect, useState } from "react";
import { NavContext, type Page } from "./nav";
import ProductsPage from "./pages/Products";
import ImportPage from "./pages/Import";
import ExportPage from "./pages/Export";
import BulkImagesPage from "./pages/Images";

const TABS: [Page, string][] = [
  ["products", "All Products"],
  ["import", "Import (Excel / CSV)"],
  ["export", "Export"],
  ["images", "Bulk Image Upload"],
];

function initialPage(): Page {
  const h = location.hash.replace("#", "") as Page;
  return TABS.some(([p]) => p === h) ? h : "products";
}

export default function App() {
  const [page, setPage] = useState<Page>(initialPage);
  const insideShopify = typeof window !== "undefined" && !!(window as any).shopify && window.top !== window.self;

  // Note: never touch history/location here. Inside the Shopify admin, App Bridge syncs the
  // iframe URL with the admin and a URL change reloads the app.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [page]);

  if (!insideShopify) {
    return (
      <div className="gl-page" style={{ maxWidth: 640, paddingTop: 60 }}>
        <div className="gl-card">
          <h1 style={{ fontSize: 22, marginTop: 0 }}>GrowthLife Product Importer</h1>
          <p>Bulk import, export and edit all your Shopify products from one screen: Excel import/export, a one-page product editor and bulk image upload.</p>
          <p className="gl-muted">This app runs inside your Shopify admin. Install it on your store, then open it from <b>Shopify admin → Apps → GrowthLife Product Importer</b>.</p>
        </div>
      </div>
    );
  }

  return (
    <NavContext.Provider value={setPage}>
      <div className="gl-appnav">
        {TABS.map(([p, label]) => (
          <button key={p} type="button" className={`gl-appnav-item ${page === p ? "active" : ""}`} onClick={() => setPage(p)}>
            {label}
          </button>
        ))}
      </div>
      {page === "products" && <ProductsPage />}
      {page === "import" && <ImportPage />}
      {page === "export" && <ExportPage />}
      {page === "images" && <BulkImagesPage />}
    </NavContext.Provider>
  );
}

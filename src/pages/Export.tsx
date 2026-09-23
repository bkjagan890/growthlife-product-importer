import { useState } from "react";
import { toast } from "../lib/client";
import { exportProducts } from "../lib/actions";

export default function ExportPage() {
  const [format, setFormat] = useState<"xlsx" | "csv">("xlsx");
  const [status, setStatus] = useState("all");
  const [q, setQ] = useState("");
  const [thumbs, setThumbs] = useState(false);
  const [busy, setBusy] = useState(false);
  const [count, setCount] = useState(0);

  async function run(template = false) {
    setBusy(true);
    try {
      setCount(0);
      const name = await exportProducts({ format, status, template, q: q.trim() || undefined, thumbs: thumbs && format === "xlsx", onProgress: setCount });
      toast(`Downloaded ${name}`);
    } catch (e: any) {
      toast(e.message, true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="gl-page">
      <div className="gl-head"><h1>Export products</h1></div>
      <div className="gl-card">
        <p style={{ marginTop: 0 }}>
          The file contains every product with all variants, sale price, MRP, cost, stock, SKU, barcode, weight, options,
          tags, collections, SEO meta, metafields and image URLs. The top rows explain what each column means, so you can fill
          the file and import it back.
        </p>
        <div className="gl-grid3">
          <div className="gl-field">
            <span className="gl-label">File format</span>
            <select className="gl-select" value={format} onChange={(e) => setFormat(e.target.value as any)}>
              <option value="xlsx">Excel (.xlsx), recommended</option>
              <option value="csv">CSV (.csv)</option>
            </select>
          </div>
          <div className="gl-field">
            <span className="gl-label">Products</span>
            <select className="gl-select" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="all">All products</option>
              <option value="active">Active only</option>
              <option value="draft">Draft only</option>
              <option value="archived">Archived only</option>
            </select>
          </div>
          <div className="gl-field">
            <span className="gl-label">Filter (optional)</span>
            <input className="gl-input" placeholder='e.g. vendor:Nike or tag:summer' value={q} onChange={(e) => setQ(e.target.value)} />
            <div className="gl-hint">Uses Shopify search syntax.</div>
          </div>
        </div>
        {format === "xlsx" && (
          <label style={{ display: "block", marginBottom: 12 }}>
            <input type="checkbox" checked={thumbs} onChange={(e) => setThumbs(e.target.checked)} /> Show thumbnail pictures inside the Excel file (slower for big stores)
          </label>
        )}
        <div style={{ display: "flex", gap: 8 }}>
          <button className="gl-btn primary" disabled={busy} onClick={() => run(false)}>
            {busy ? <><span className="gl-spinner" /> Preparing file… {count > 0 ? `${count} products` : ""}</> : `⬇ Export ${format.toUpperCase()}`}
          </button>
          <button className="gl-btn" disabled={busy} onClick={() => run(true)}>⬇ Blank template with examples</button>
        </div>
      </div>
    </div>
  );
}

import { useState } from "react";
import { toast } from "../lib/client";
import { exportProducts, REPORTS, type ReportType } from "../lib/actions";

export default function ExportPage() {
  const [format, setFormat] = useState<"xlsx" | "csv">("xlsx");
  const [status, setStatus] = useState("all");
  const [q, setQ] = useState("");
  const [thumbs, setThumbs] = useState(false);
  const [busy, setBusy] = useState(false);
  const [count, setCount] = useState(0);

  const [report, setReport] = useState<ReportType | "">("");

  async function run(template = false, onlyReport?: ReportType) {
    setBusy(true);
    try {
      setCount(0);
      const r = onlyReport ?? (report || undefined);
      const name = await exportProducts({ format, status, template, q: q.trim() || undefined, thumbs: thumbs && format === "xlsx", onProgress: setCount, report: r });
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
        <div className="gl-grid2">
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
            <span className="gl-label">Report</span>
            <select className="gl-select" value={report} onChange={(e) => setReport(e.target.value as any)}>
              <option value="">No report (all matching products)</option>
              {(Object.keys(REPORTS) as ReportType[]).map((k) => <option key={k} value={k}>{REPORTS[k].label}</option>)}
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

      <div className="gl-card">
        <h2>Quick reports</h2>
        <p className="gl-muted" style={{ marginTop: 0 }}>
          Each file has a "Missing / Issues" column saying what to fill. Fill the gaps in Excel and import the same file back.
        </p>
        <div className="gl-steps">
          <div className="gl-step"><b>✓ Complete products</b>Every field filled: description, images, price and MRP, SKU, stock, brand, type, tags, collection, SEO.
            <div style={{ marginTop: 8 }}><button className="gl-btn" disabled={busy} onClick={() => run(false, "complete")}>⬇ Download</button></div></div>
          <div className="gl-step"><b>🖼 Missing images</b>Products with no image at all.
            <div style={{ marginTop: 8 }}><button className="gl-btn" disabled={busy} onClick={() => run(false, "no-images")}>⬇ Download</button></div></div>
          <div className="gl-step"><b>📣 Not ready for ads</b>Missing sales essentials: description (100+ chars), images, price, stock, SKU, brand, type, attributes/variants, correct MRP, live status.
            <div style={{ marginTop: 8 }}><button className="gl-btn" disabled={busy} onClick={() => run(false, "ads")}>⬇ Download</button></div></div>
        </div>
      </div>
    </div>
  );
}

import { useRef, useState } from "react";
import { NavLink } from "../nav";
import type { ProductDraft } from "../lib/model";
import { toast } from "../lib/client";
import { exportProducts, parseImportFile, saveDrafts } from "../lib/actions";

interface Issue { row: number; handle: string; message: string }
interface Result { handle: string; ok: boolean; action: string; errors: string[]; warnings: string[] }

const BATCH = 3;

export default function ImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [over, setOver] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState<{ drafts: ProductDraft[]; issues: Issue[]; pasted: number; rows: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(0);
  const [results, setResults] = useState<Result[]>([]);
  const stopRef = useRef(false);
  const input = useRef<HTMLInputElement>(null);

  async function parse(f: File) {
    setFile(f);
    setParsed(null);
    setResults([]);
    setDone(0);
    setError(null);
    setParsing(true);
    try {
      const data = await parseImportFile(f, setStatus);
      setParsed(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setParsing(false);
    }
  }

  async function run() {
    if (!parsed) return;
    setRunning(true);
    stopRef.current = false;
    setResults([]);
    setDone(0);
    const all: Result[] = [];
    for (let i = 0; i < parsed.drafts.length; i += BATCH) {
      if (stopRef.current) break;
      const batch = parsed.drafts.slice(i, i + BATCH);
      try {
        all.push(...(await saveDrafts(batch, true)));
      } catch (e: any) {
        all.push(...batch.map((d) => ({ handle: d.handle, ok: false, action: "", errors: [e.message], warnings: [] })));
      }
      setResults([...all]);
      setDone(Math.min(i + BATCH, parsed.drafts.length));
    }
    setRunning(false);
    const ok = all.filter((r) => r.ok).length;
    toast(`Import finished: ${ok} saved, ${all.length - ok} failed`, all.length - ok > 0);
  }

  const total = parsed?.drafts.length ?? 0;
  const created = results.filter((r) => r.ok && r.action === "created").length;
  const updated = results.filter((r) => r.ok && r.action === "updated").length;
  const failed = results.filter((r) => !r.ok).length;
  const variants = parsed?.drafts.reduce((s, d) => s + d.variants.length, 0) ?? 0;
  const images = parsed?.drafts.reduce((s, d) => s + d.images.length, 0) ?? 0;

  function downloadReport() {
    const lines = [["Handle", "Result", "Action", "Errors", "Warnings"]];
    for (const r of results) lines.push([r.handle, r.ok ? "OK" : "FAILED", r.action, r.errors.join(" | "), r.warnings.join(" | ")]);
    const csv = lines.map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv" }));
    a.download = "import-report.csv";
    a.click();
  }

  return (
    <div className="gl-page">
      <div className="gl-head">
        <h1>Import products from Excel / CSV</h1>
        <button className="gl-btn" onClick={() => exportProducts({ format: "xlsx", template: true }).catch((e) => toast(e.message, true))}>
          ⬇ Blank template
        </button>
        <NavLink className="gl-btn" to="export">⬇ Export current products</NavLink>
      </div>

      <div className="gl-card">
        <div className="gl-steps">
          <div className="gl-step"><b>1. Download</b>Export your products or the blank template. Row 3 has headers, row 4 explains every column.</div>
          <div className="gl-step"><b>2. Fill in Excel</b>One row per variant. Add Sale Price, MRP, Quantity, SKU, options, SEO, tags, collections and image URLs.</div>
          <div className="gl-step"><b>3. Add pictures</b>Paste image URLs, or insert pictures into the "Paste Images Here" column. They upload automatically.</div>
          <div className="gl-step"><b>4. Import</b>Upload the file here. Existing handles are updated, new handles are created.</div>
        </div>
      </div>

      <div className="gl-card">
        <div
          className={`gl-drop ${over ? "over" : ""}`}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.current?.click(); } }}
          style={{ padding: 34 }}
          onClick={() => input.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files[0]; if (f) parse(f); }}
        >
          {parsing ? (
            <><span className="gl-spinner" /> {status || `Reading ${file?.name}…`}</>
          ) : (
            <>
              <div style={{ fontSize: 15, fontWeight: 600, color: "var(--gl-text)" }}>{file ? file.name : "Drop your .xlsx or .csv file here"}</div>
              <div>or click to choose a file · Shopify product CSV also works</div>
            </>
          )}
          <input ref={input} type="file" hidden accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) parse(f); e.target.value = ""; }} />
        </div>
        {error && <div className="gl-alert err" style={{ marginTop: 10 }}>{error}</div>}
      </div>

      {parsed && (
        <div className="gl-card">
          <h2>Ready to import</h2>
          <div className="gl-grid3" style={{ marginBottom: 12 }}>
            <div><b style={{ fontSize: 22 }}>{total}</b><div className="gl-muted">products ({parsed.rows} rows)</div></div>
            <div><b style={{ fontSize: 22 }}>{variants}</b><div className="gl-muted">variants</div></div>
            <div><b style={{ fontSize: 22 }}>{images}</b><div className="gl-muted">images ({parsed.pasted} pasted pictures uploaded)</div></div>
          </div>

          {parsed.issues.length > 0 && (
            <div className="gl-alert warn">
              <b>{parsed.issues.length} note(s) in the file:</b>
              <ul style={{ margin: "6px 0 0", paddingLeft: 18, maxHeight: 160, overflowY: "auto" }}>
                {parsed.issues.map((i, k) => <li key={k}>Row {i.row}{i.handle ? ` (${i.handle})` : ""}: {i.message}</li>)}
              </ul>
            </div>
          )}

          <div className="gl-table-wrap" style={{ maxHeight: 280, overflowY: "auto", marginBottom: 12 }}>
            <table className="gl-table">
              <thead><tr><th></th><th>Handle</th><th>Title</th><th>Status</th><th>Variants</th><th>Price / MRP</th><th>Qty</th><th>Images</th><th>Collections</th><th>Result</th></tr></thead>
              <tbody>
                {parsed.drafts.map((d) => {
                  const r = results.find((x) => x.handle === d.handle);
                  const img = d.images[0]?.src;
                  return (
                    <tr key={d.handle} style={{ cursor: "default" }}>
                      <td>{img && !img.includes("shopify-staged-uploads") ? <img className="gl-thumb" src={img} alt="" style={{ width: 32, height: 32 }} /> : null}</td>
                      <td>{d.handle}</td>
                      <td>{d.title}</td>
                      <td><span className={`gl-badge ${d.status}`}>{d.status.toLowerCase()}</span></td>
                      <td>{d.variants.length}</td>
                      <td>{d.variants[0]?.price ?? "—"}{d.variants[0]?.compareAtPrice ? <span className="gl-strike">{d.variants[0].compareAtPrice}</span> : null}</td>
                      <td>{d.variants.reduce((s, v) => s + (Number(v.quantity) || 0), 0)}</td>
                      <td>{d.images.length}</td>
                      <td>{d.collections.join(", ")}</td>
                      <td>
                        {!r ? <span className="gl-muted">{running ? "…" : "pending"}</span>
                          : r.ok ? <span className="gl-ok" title={r.warnings.join("\n")}>✓ {r.action}{r.warnings.length ? " ⚠" : ""}</span>
                          : <span className="gl-err" title={r.errors.join("\n")}>✕ {r.errors[0]?.slice(0, 60)}</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {(running || results.length > 0) && (
            <div style={{ marginBottom: 12 }}>
              <div className="gl-progress"><span style={{ width: `${total ? (done / total) * 100 : 0}%` }} /></div>
              <div className="gl-muted" style={{ marginTop: 4 }}>
                {done}/{total} processed · <span className="gl-ok">{created} created</span> · <span className="gl-ok">{updated} updated</span> · <span className="gl-err">{failed} failed</span>
              </div>
            </div>
          )}

          <div style={{ display: "flex", gap: 8 }}>
            {!running ? (
              <button className="gl-btn primary" onClick={run} disabled={!total}>
                {results.length ? "Run import again" : `Import ${total} products`}
              </button>
            ) : (
              <button className="gl-btn danger" onClick={() => { stopRef.current = true; }}>Stop</button>
            )}
            {results.length > 0 && !running && <button className="gl-btn" onClick={downloadReport}>⬇ Download report</button>}
            {results.length > 0 && !running && <NavLink className="gl-btn" to="products">View products</NavLink>}
          </div>
        </div>
      )}
    </div>
  );
}

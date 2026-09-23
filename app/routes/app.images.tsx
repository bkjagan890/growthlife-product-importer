import { useRef, useState } from "react";
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { toast, uploadImage } from "../lib/client";
import { matchKeyFromFilename } from "../lib/filename";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

interface Item { file: File; key: string; preview: string; state: "waiting" | "uploading" | "done" | "error"; message?: string }

export default function BulkImagesPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [over, setOver] = useState(false);
  const [running, setRunning] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const add = (files: FileList | File[]) => {
    const list = Array.from(files).filter((f) => f.type.startsWith("image/"));
    setItems((cur) => [
      ...cur,
      ...list.map((file) => ({ file, key: matchKeyFromFilename(file.name), preview: URL.createObjectURL(file), state: "waiting" as const })),
    ]);
  };
  const patch = (i: number, p: Partial<Item>) => setItems((cur) => cur.map((x, j) => (j === i ? { ...x, ...p } : x)));

  async function start() {
    setRunning(true);
    let ok = 0;
    // sort so image-1 comes before image-2 for the same product
    const order = items.map((it, i) => ({ it, i })).filter(({ it }) => it.state !== "done")
      .sort((a, b) => a.it.file.name.localeCompare(b.it.file.name, undefined, { numeric: true }));
    for (const { it, i } of order) {
      if (!it.key) { patch(i, { state: "error", message: "No handle/SKU in file name" }); continue; }
      patch(i, { state: "uploading" });
      try {
        const r = await uploadImage(it.file, it.key);
        patch(i, { state: "done", message: `Added to ${r.product?.title}` });
        ok++;
      } catch (e: any) {
        patch(i, { state: "error", message: e.message });
      }
    }
    setRunning(false);
    toast(`${ok} image(s) added`);
  }

  const done = items.filter((i) => i.state === "done").length;

  return (
    <div className="gl-page">
      <div className="gl-head">
        <h1>Bulk image upload</h1>
        {items.length > 0 && !running && <button className="gl-btn" onClick={() => setItems([])}>Clear</button>}
        <button className="gl-btn primary" disabled={!items.length || running} onClick={start}>
          {running ? <><span className="gl-spinner" /> Uploading {done}/{items.length}</> : `Upload ${items.filter((i) => i.state !== "done").length} image(s)`}
        </button>
      </div>
      <div className="gl-card">
        <p style={{ marginTop: 0 }}>
          Name each picture after the product <b>handle</b> or variant <b>SKU</b>. Add <code>_2</code>, <code>-3</code> or <code>(4)</code> for more pictures of the same product.
          Examples: <code>classic-cotton-tshirt.jpg</code>, <code>classic-cotton-tshirt_2.jpg</code>, <code>TS-M-RED.png</code>. Pictures are added after the existing ones; the product's first picture stays the thumbnail.
        </p>
        <div className={`gl-drop ${over ? "over" : ""}`}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.current?.click(); } }} style={{ padding: 34 }}
          onClick={() => input.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); add(e.dataTransfer.files); }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: "var(--gl-text)" }}>Drop many images here</div>
          <div>or click to choose (you can select a whole folder's pictures)</div>
          <input ref={input} type="file" accept="image/*" multiple hidden onChange={(e) => { if (e.target.files) add(e.target.files); e.target.value = ""; }} />
        </div>
      </div>
      {items.length > 0 && (
        <div className="gl-card">
          <table className="gl-table">
            <thead><tr><th></th><th>File</th><th>Match handle / SKU (editable)</th><th>Status</th></tr></thead>
            <tbody>
              {items.map((it, i) => (
                <tr key={i} style={{ cursor: "default" }}>
                  <td><img className="gl-thumb" src={it.preview} alt="" /></td>
                  <td>{it.file.name}</td>
                  <td><input className="gl-input" value={it.key} disabled={running} onChange={(e) => patch(i, { key: e.target.value, state: "waiting" })} /></td>
                  <td>
                    {it.state === "waiting" && <span className="gl-muted">waiting</span>}
                    {it.state === "uploading" && <span className="gl-spinner" />}
                    {it.state === "done" && <span className="gl-ok">✓ {it.message}</span>}
                    {it.state === "error" && <span className="gl-err">✕ {it.message}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);

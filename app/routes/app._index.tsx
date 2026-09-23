import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Link } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { checkCompleteness, type ProductSummary } from "../lib/model";
import { downloadFile, fetchJson, toast } from "../lib/client";
import { ProductEditor } from "../components/ProductEditor";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

type Tab = "all" | "complete" | "incomplete" | "ACTIVE" | "DRAFT" | "ARCHIVED";

const money = (v?: string) => (v === undefined || v === null || v === "" ? "—" : Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 }));

export default function ProductsPage() {
  const [products, setProducts] = useState<ProductSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<Tab>("all");
  const [missingFilter, setMissingFilter] = useState("");
  const [editing, setEditing] = useState<string | null | undefined>(undefined); // undefined = closed, null = new
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);
  const loadId = useRef(0);

  const loadAll = useCallback(async () => {
    const my = ++loadId.current;
    setLoading(true);
    setError(null);
    let cursor: string | null = null;
    const acc: ProductSummary[] = [];
    try {
      do {
        const page: { items: ProductSummary[]; hasNextPage: boolean; endCursor: string | null } = await fetchJson(
          `/app/api/products${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
        );
        if (my !== loadId.current) return;
        acc.push(...page.items);
        setProducts([...acc]);
        cursor = page.hasNextPage ? page.endCursor : null;
      } while (cursor);
    } catch (e: any) {
      setError(e.message);
    } finally {
      if (my === loadId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadAll();
  }, [loadAll]);

  const withScore = useMemo(() => products.map((p) => ({ p, c: checkCompleteness(p) })), [products]);

  const searched = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return withScore;
    const words = q.split(/\s+/);
    return withScore.filter(({ p }) => {
      const hay = `${p.title} ${p.handle} ${p.vendor} ${p.productType} ${p.tags.join(" ")} ${p.status}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }, [withScore, search]);

  const counts = useMemo(() => {
    const c: Record<Tab, number> = { all: 0, complete: 0, incomplete: 0, ACTIVE: 0, DRAFT: 0, ARCHIVED: 0 };
    for (const { p, c: cc } of searched) {
      c.all++;
      c[cc.complete ? "complete" : "incomplete"]++;
      c[p.status]++;
    }
    return c;
  }, [searched]);

  const missingOptions = useMemo(() => {
    const m = new Map<string, number>();
    for (const { c } of searched) for (const x of c.missing) m.set(x, (m.get(x) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [searched]);

  const visible = useMemo(
    () =>
      searched.filter(({ p, c }) => {
        if (tab === "complete" && !c.complete) return false;
        if (tab === "incomplete" && c.complete) return false;
        if ((tab === "ACTIVE" || tab === "DRAFT" || tab === "ARCHIVED") && p.status !== tab) return false;
        if (missingFilter && !c.missing.includes(missingFilter)) return false;
        return true;
      }),
    [searched, tab, missingFilter],
  );

  const onSaved = (summary: ProductSummary | null) => {
    if (summary) {
      setProducts((list) => {
        const i = list.findIndex((x) => x.id === summary.id);
        if (i >= 0) {
          const copy = [...list];
          copy[i] = summary;
          return copy;
        }
        return [summary, ...list];
      });
    } else {
      loadAll();
    }
    setEditing(undefined);
  };

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  const allVisibleSelected = visible.length > 0 && visible.every(({ p }) => selected.has(p.id));

  async function exportSelection(format: "xlsx" | "csv") {
    setExporting(true);
    try {
      const ids = selected.size ? [...selected] : visible.map(({ p }) => p.id);
      if (!ids.length) return toast("Nothing to export", true);
      const params = new URLSearchParams({ format });
      if (ids.length !== products.length) params.set("ids", ids.map((i) => i.split("/").pop()).join(","));
      const name = await downloadFile(`/app/api/export?${params}`, `products.${format}`);
      toast(`Downloaded ${name}`);
    } catch (e: any) {
      toast(e.message, true);
    } finally {
      setExporting(false);
    }
  }

  const tabs: [Tab, string][] = [
    ["all", "All"],
    ["complete", "✓ Complete"],
    ["incomplete", "Needs details"],
    ["ACTIVE", "Active"],
    ["DRAFT", "Draft"],
    ["ARCHIVED", "Archived"],
  ];

  return (
    <div className="gl-page">
      <div className="gl-head">
        <h1>GrowthLife Product Importer</h1>
        <Link to="/app/import" className="gl-btn">⬆ Import Excel</Link>
        <button className="gl-btn" disabled={exporting} onClick={() => exportSelection("xlsx")}>
          {exporting ? <span className="gl-spinner" /> : "⬇"} Export {selected.size ? `${selected.size} selected` : visible.length !== products.length ? `${visible.length} shown` : "all"}
        </button>
        <button className="gl-btn primary" onClick={() => setEditing(null)}>+ Add product</button>
      </div>
      <p className="gl-sub">
        Every product on one page. Click any product to edit title, description, prices, stock, variants, images, collections and SEO in one popup.
      </p>

      <div className="gl-card" style={{ padding: 12 }}>
        <div className="gl-toolbar">
          <div className="gl-search">
            <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M8 2a6 6 0 104.47 10l4.26 4.27 1.06-1.06L13.53 11A6 6 0 008 2zm0 1.5a4.5 4.5 0 110 9 4.5 4.5 0 010-9z" /></svg>
            <input className="gl-input" placeholder="Search by title, handle, vendor, type, tag…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <select className="gl-select" style={{ width: 200 }} value={missingFilter} onChange={(e) => setMissingFilter(e.target.value)}>
            <option value="">Missing: any</option>
            {missingOptions.map(([name, n]) => (
              <option key={name} value={name}>Missing {name} ({n})</option>
            ))}
          </select>
          <button className="gl-btn" onClick={loadAll} disabled={loading}>{loading ? <span className="gl-spinner" /> : "↻"} Refresh</button>
        </div>

        <div className="gl-tabs">
          {tabs.map(([key, label]) => (
            <button key={key} className={`gl-tab ${tab === key ? "active" : ""}`} onClick={() => setTab(key)}>
              {label}<span className="gl-count">{counts[key]}</span>
            </button>
          ))}
        </div>

        {error && <div className="gl-alert err">{error}</div>}
        {loading && <div className="gl-muted" style={{ marginBottom: 8 }}><span className="gl-spinner" /> Loading products… {products.length} loaded</div>}

        <div className="gl-table-wrap">
          <table className="gl-table">
            <thead>
              <tr>
                <th style={{ width: 30 }}>
                  <input type="checkbox" checked={allVisibleSelected} aria-label="Select all"
                    onChange={() => setSelected(allVisibleSelected ? new Set() : new Set(visible.map(({ p }) => p.id)))} />
                </th>
                <th style={{ width: 54 }}></th>
                <th>Product</th>
                <th>Status</th>
                <th>Sale price</th>
                <th>Stock</th>
                <th>Variants</th>
                <th>Type / Vendor</th>
                <th>Completeness</th>
              </tr>
            </thead>
            <tbody>
              {visible.map(({ p, c }) => (
                <tr key={p.id} onClick={() => setEditing(p.id)}>
                  <td onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} aria-label={`Select ${p.title}`} />
                  </td>
                  <td>{p.image ? <img className="gl-thumb" src={p.image} alt="" loading="lazy" /> : <div className="gl-thumb empty">No img</div>}</td>
                  <td>
                    <div className="gl-title">{p.title}</div>
                    <div className="gl-muted" style={{ fontSize: 11 }}>{p.handle}{p.tags.length ? ` · ${p.tags.slice(0, 3).join(", ")}` : ""}</div>
                  </td>
                  <td><span className={`gl-badge ${p.status}`}>{p.status.toLowerCase()}</span></td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    {money(p.priceMin)}{p.priceMax && p.priceMax !== p.priceMin ? ` – ${money(p.priceMax)}` : ""}
                    {p.compareAt && Number(p.compareAt) > 0 && <span className="gl-strike">{money(p.compareAt)}</span>}
                  </td>
                  <td>{p.totalInventory === null ? <span className="gl-muted">not tracked</span> : p.totalInventory <= 0 ? <span className="gl-err">{p.totalInventory}</span> : p.totalInventory}</td>
                  <td>{p.variantsCount}</td>
                  <td><div>{p.productType || <span className="gl-muted">—</span>}</div><div className="gl-muted" style={{ fontSize: 11 }}>{p.vendor}</div></td>
                  <td style={{ minWidth: 180 }}>
                    {c.complete ? (
                      <span className="gl-ok">✓ All filled</span>
                    ) : (
                      <>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <div className={`gl-bar ${c.score < 50 ? "low" : c.score < 80 ? "mid" : ""}`}><span style={{ width: `${c.score}%` }} /></div>
                          <span className="gl-muted">{c.score}%</span>
                        </div>
                        <div>
                          {c.missing.slice(0, 4).map((m) => <span className="gl-chip" key={m}>{m}</span>)}
                          {c.missing.length > 4 && <span className="gl-muted"> +{c.missing.length - 4}</span>}
                        </div>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && visible.length === 0 && (
            <div className="gl-empty">{products.length ? "No products match this search or tab." : "No products yet. Add one or import an Excel file."}</div>
          )}
        </div>
      </div>

      {editing !== undefined && <ProductEditor productId={editing} onClose={() => setEditing(undefined)} onSaved={onSaved} />}
    </div>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);

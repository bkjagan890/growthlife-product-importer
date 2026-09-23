import { useEffect, useMemo, useRef, useState } from "react";
import {
  emptyDraft,
  regenerateVariants,
  slugify,
  type DraftImage,
  type DraftVariant,
  type ProductDraft,
  type ProductSummary,
} from "../lib/model";
import { fetchJson, postJson, toast, uploadImage } from "../lib/client";

interface Props {
  productId: string | null; // null = new product
  onClose: () => void;
  onSaved: (summary: ProductSummary | null) => void;
}

interface CollectionInfo {
  id: string;
  title: string;
  smart: boolean;
}

export function ProductEditor({ productId, onClose, onSaved }: Props) {
  const [draft, setDraft] = useState<ProductDraft | null>(null);
  const [collections, setCollections] = useState<CollectionInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [uploading, setUploading] = useState(0);

  useEffect(() => {
    let cancel = false;
    const url = productId ? `/app/api/product?id=${encodeURIComponent(productId)}` : "/app/api/product";
    fetchJson<{ draft: ProductDraft | null; collections: CollectionInfo[] }>(url)
      .then((d) => {
        if (cancel) return;
        setDraft(d.draft ?? emptyDraft());
        setCollections(d.collections);
      })
      .catch((e) => !cancel && setError(e.message));
    return () => {
      cancel = true;
    };
  }, [productId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") tryClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const update = (patch: Partial<ProductDraft>) => {
    setDraft((d) => (d ? { ...d, ...patch } : d));
    setDirty(true);
  };

  function tryClose() {
    if (dirty && !confirm("Discard unsaved changes?")) return;
    onClose();
  }

  async function save() {
    if (!draft) return;
    if (!draft.title.trim()) {
      setError("Title is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = { ...draft, handle: draft.handle || slugify(draft.title) };
      const res = await postJson<{ results: { ok: boolean; errors: string[]; warnings: string[]; action: string }[]; summary: ProductSummary | null }>(
        "/app/api/product",
        { draft: payload },
      );
      const r = res.results[0];
      if (!r.ok) {
        setError(r.errors.join("\n"));
        return;
      }
      toast(`Product ${r.action}${r.warnings.length ? " (with warnings)" : ""}`);
      if (r.warnings.length) alert(r.warnings.join("\n"));
      setDirty(false);
      onSaved(res.summary);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function addFiles(files: FileList | File[]) {
    const list = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (!list.length) return;
    setUploading((n) => n + list.length);
    for (const f of list) {
      try {
        const { resourceUrl } = await uploadImage(f);
        setDraft((d) => (d ? { ...d, images: [...d.images, { src: resourceUrl, alt: d.title, previewUrl: URL.createObjectURL(f) } as any] } : d));
        setDirty(true);
      } catch (e: any) {
        toast(`Upload failed: ${e.message}`, true);
      } finally {
        setUploading((n) => n - 1);
      }
    }
  }

  return (
    <div className="gl-overlay" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && tryClose()}>
      <div className="gl-modal" role="dialog" aria-modal="true">
        <div className="gl-modal-head">
          <h2>{productId ? draft?.title || "Loading…" : "New product"}</h2>
          {draft && (
            <select className="gl-select" style={{ width: 120 }} value={draft.status} onChange={(e) => update({ status: e.target.value as any })}>
              <option value="ACTIVE">Active</option>
              <option value="DRAFT">Draft</option>
              <option value="ARCHIVED">Archived</option>
            </select>
          )}
          <button className="gl-btn" onClick={tryClose} aria-label="Close">✕</button>
        </div>

        {!draft && !error && (
          <div className="gl-empty"><span className="gl-spinner" /> Loading product…</div>
        )}
        {error && <div className="gl-alert err" style={{ margin: "12px 18px 0", whiteSpace: "pre-wrap" }}>{error}</div>}

        {draft && (
          <div className="gl-modal-body">
            <div>
              <BasicSection draft={draft} update={update} />
              <VariantsSection draft={draft} update={update} />
              <MetafieldsSection draft={draft} update={update} />
            </div>
            <div>
              <ImagesSection draft={draft} update={update} addFiles={addFiles} uploading={uploading} />
              <OrganizeSection draft={draft} update={update} collections={collections} />
              <SeoSection draft={draft} update={update} />
            </div>
          </div>
        )}

        <div className="gl-modal-foot">
          <span className="gl-muted" style={{ marginRight: "auto", alignSelf: "center" }}>
            {dirty ? "Unsaved changes" : ""}
          </span>
          <button className="gl-btn" onClick={tryClose}>Cancel</button>
          <button className="gl-btn primary" onClick={save} disabled={!draft || saving || uploading > 0}>
            {saving ? <><span className="gl-spinner" /> Saving…</> : uploading > 0 ? "Uploading images…" : "Save product"}
          </button>
        </div>
      </div>
    </div>
  );
}

type SectionProps = { draft: ProductDraft; update: (p: Partial<ProductDraft>) => void };

function BasicSection({ draft, update }: SectionProps) {
  const [preview, setPreview] = useState(false);
  return (
    <div className="gl-section">
      <h3>Basic details</h3>
      <div className="gl-field">
        <span className="gl-label">Title *</span>
        <input className="gl-input" value={draft.title} onChange={(e) => update({ title: e.target.value, ...(draft.id ? {} : { handle: slugify(e.target.value) }) })} />
      </div>
      <div className="gl-field">
        <span className="gl-label">
          Description
          <button type="button" className="gl-btn sm" style={{ float: "right" }} onClick={() => setPreview((p) => !p)}>
            {preview ? "Edit HTML" : "Preview"}
          </button>
        </span>
        {preview ? (
          <div className="gl-serp" style={{ minHeight: 90 }} dangerouslySetInnerHTML={{ __html: draft.descriptionHtml || "<i>Empty</i>" }} />
        ) : (
          <>
            <HtmlToolbar value={draft.descriptionHtml ?? ""} onChange={(v) => update({ descriptionHtml: v })} />
            <textarea className="gl-textarea" rows={7} value={draft.descriptionHtml ?? ""} onChange={(e) => update({ descriptionHtml: e.target.value })} placeholder="<p>Describe the product…</p>" />
          </>
        )}
      </div>
      <div className="gl-field">
        <span className="gl-label">URL handle</span>
        <input className="gl-input" value={draft.handle} onChange={(e) => update({ handle: e.target.value })} />
      </div>
    </div>
  );
}

function HtmlToolbar({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const add = (snippet: string) => onChange(value + snippet);
  return (
    <div style={{ display: "flex", gap: 4, marginBottom: 4, flexWrap: "wrap" }}>
      <button type="button" className="gl-btn sm" onClick={() => add("<p></p>")}>¶ Paragraph</button>
      <button type="button" className="gl-btn sm" onClick={() => add("<h3></h3>")}>H3</button>
      <button type="button" className="gl-btn sm" onClick={() => add("<strong></strong>")}><b>B</b></button>
      <button type="button" className="gl-btn sm" onClick={() => add("<ul>\n  <li></li>\n  <li></li>\n</ul>")}>• List</button>
      <button type="button" className="gl-btn sm" onClick={() => onChange(value.split(/\n{2,}/).map((p) => (p.trim().startsWith("<") ? p : `<p>${p.trim()}</p>`)).join("\n"))}>Text → HTML</button>
    </div>
  );
}

function ImagesSection({ draft, update, addFiles, uploading }: SectionProps & { addFiles: (f: FileList | File[]) => void; uploading: number }) {
  const [over, setOver] = useState(false);
  const [url, setUrl] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const move = (i: number, to: number) => {
    const imgs = [...draft.images];
    const [x] = imgs.splice(i, 1);
    imgs.splice(to, 0, x);
    update({ images: imgs });
  };
  const setImg = (i: number, patch: Partial<DraftImage>) => update({ images: draft.images.map((im, j) => (j === i ? { ...im, ...patch } : im)) });
  return (
    <div className="gl-section">
      <h3>Images <span className="gl-muted">(first = thumbnail)</span></h3>
      <div className="gl-images">
        {draft.images.map((im, i) => (
          <div key={im.src + i} className={`gl-img ${i === 0 ? "featured" : ""}`}>
            {i === 0 && <span className="gl-feat">Thumbnail</span>}
            <img src={(im as any).previewUrl ?? im.src} alt={im.alt ?? ""} />
            <div className="gl-img-tools">
              <button title="Move left" disabled={i === 0} onClick={() => move(i, i - 1)}>◀</button>
              {i !== 0 && <button title="Make thumbnail" onClick={() => move(i, 0)}>★</button>}
              <button title="Alt text" onClick={() => {
                const alt = prompt("Image alt text (SEO)", im.alt ?? "");
                if (alt !== null) setImg(i, { alt });
              }}>Alt</button>
              <button title="Remove" onClick={() => update({ images: draft.images.filter((_, j) => j !== i) })}>✕</button>
            </div>
          </div>
        ))}
      </div>
      <div
        className={`gl-drop ${over ? "over" : ""}`}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.current?.click(); } }}
        style={{ marginTop: 8 }}
        onClick={() => input.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); addFiles(e.dataTransfer.files); }}
      >
        {uploading > 0 ? <><span className="gl-spinner" /> Uploading {uploading}…</> : "Drop images here or click to upload"}
        <input ref={input} type="file" accept="image/*" multiple hidden onChange={(e) => e.target.files && addFiles(e.target.files)} />
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
        <input className="gl-input" placeholder="…or paste image URL" value={url} onChange={(e) => setUrl(e.target.value)} />
        <button className="gl-btn" onClick={() => {
          const urls = url.split(/[\s,]+/).filter((u) => /^https?:\/\//.test(u));
          if (urls.length) update({ images: [...draft.images, ...urls.map((src) => ({ src, alt: draft.title }))] });
          setUrl("");
        }}>Add</button>
      </div>
    </div>
  );
}

function OrganizeSection({ draft, update, collections }: SectionProps & { collections: CollectionInfo[] }) {
  const [tag, setTag] = useState("");
  const [colFilter, setColFilter] = useState("");
  const [newCol, setNewCol] = useState("");
  const manual = collections.filter((c) => !c.smart);
  const allTitles = Array.from(new Set([...manual.map((c) => c.title), ...draft.collections]));
  const shown = allTitles.filter((t) => t.toLowerCase().includes(colFilter.toLowerCase()));
  const addTags = (v: string) => {
    const t = v.split(",").map((s) => s.trim()).filter(Boolean);
    if (t.length) update({ tags: Array.from(new Set([...draft.tags, ...t])) });
    setTag("");
  };
  return (
    <div className="gl-section">
      <h3>Organization</h3>
      <div className="gl-grid2">
        <div className="gl-field">
          <span className="gl-label">Vendor / Brand</span>
          <input className="gl-input" value={draft.vendor ?? ""} onChange={(e) => update({ vendor: e.target.value })} />
        </div>
        <div className="gl-field">
          <span className="gl-label">Product type</span>
          <input className="gl-input" value={draft.productType ?? ""} onChange={(e) => update({ productType: e.target.value })} />
        </div>
      </div>
      <div className="gl-field">
        <span className="gl-label">Tags</span>
        <input className="gl-input" value={tag} placeholder="Type and press Enter (comma for many)" onChange={(e) => setTag(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTags(tag); } }} onBlur={() => addTags(tag)} />
        <div className="gl-tags">
          {draft.tags.map((t) => (
            <span className="gl-tag" key={t}>{t}<button onClick={() => update({ tags: draft.tags.filter((x) => x !== t) })}>✕</button></span>
          ))}
        </div>
      </div>
      <div className="gl-field">
        <span className="gl-label">Collections</span>
        <input className="gl-input" placeholder="Filter collections" value={colFilter} onChange={(e) => setColFilter(e.target.value)} style={{ marginBottom: 6 }} />
        <div className="gl-check-list">
          {shown.length === 0 && <div className="gl-muted">No collections</div>}
          {shown.map((t) => (
            <label key={t}>
              <input type="checkbox" checked={draft.collections.includes(t)}
                onChange={(e) => update({ collections: e.target.checked ? [...draft.collections, t] : draft.collections.filter((x) => x !== t) })} />
              {t}
            </label>
          ))}
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
          <input className="gl-input" placeholder="New collection name" value={newCol} onChange={(e) => setNewCol(e.target.value)} />
          <button className="gl-btn" onClick={() => { if (newCol.trim()) update({ collections: [...draft.collections, newCol.trim()] }); setNewCol(""); }}>Add</button>
        </div>
        <div className="gl-hint">New collections are created when you save. Automated collections fill by their own rules.</div>
      </div>
    </div>
  );
}

function SeoSection({ draft, update }: SectionProps) {
  const t = draft.seoTitle ?? "";
  const d = draft.seoDescription ?? "";
  return (
    <div className="gl-section">
      <h3>SEO meta
        <button className="gl-btn sm" onClick={() => update({
          seoTitle: t || draft.title.slice(0, 70),
          seoDescription: d || (draft.descriptionHtml ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 160),
        })}>Auto-fill</button>
      </h3>
      <div className="gl-field">
        <span className="gl-label">Meta title <span className={`gl-counter ${t.length > 70 ? "over" : ""}`}>{t.length}/70</span></span>
        <input className="gl-input" value={t} onChange={(e) => update({ seoTitle: e.target.value })} placeholder={draft.title} />
      </div>
      <div className="gl-field">
        <span className="gl-label">Meta description <span className={`gl-counter ${d.length > 160 ? "over" : ""}`}>{d.length}/160</span></span>
        <textarea className="gl-input" rows={3} value={d} onChange={(e) => update({ seoDescription: e.target.value })} />
      </div>
      <div className="gl-serp">
        <div className="u">yourstore.com › products › {draft.handle || slugify(draft.title)}</div>
        <div className="t">{t || draft.title || "Product title"}</div>
        <div className="d">{d || "Meta description shows here in Google results."}</div>
      </div>
    </div>
  );
}

function MetafieldsSection({ draft, update }: SectionProps) {
  const set = (i: number, patch: any) => update({ metafields: draft.metafields.map((m, j) => (j === i ? { ...m, ...patch } : m)) });
  return (
    <div className="gl-section">
      <h3>Metafields / extra attributes
        <button className="gl-btn sm" onClick={() => update({ metafields: [...draft.metafields, { namespace: "custom", key: "", value: "" }] })}>+ Add</button>
      </h3>
      {draft.metafields.length === 0 && <div className="gl-muted">e.g. material, warranty, dimensions, country of origin.</div>}
      {draft.metafields.map((m, i) => (
        <div key={i} style={{ display: "grid", gridTemplateColumns: "90px 1fr 2fr auto", gap: 6, marginBottom: 6 }}>
          <input className="gl-input" value={m.namespace} title="namespace" onChange={(e) => set(i, { namespace: e.target.value })} />
          <input className="gl-input" value={m.key} placeholder="key e.g. material" onChange={(e) => set(i, { key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") })} />
          <input className="gl-input" value={m.value} placeholder="value" disabled={!!m.type && m.type !== "single_line_text_field" && m.type !== "multi_line_text_field" && m.type !== "number_integer" && m.type !== "number_decimal"} onChange={(e) => set(i, { value: e.target.value })} />
          <button className="gl-btn sm danger" onClick={() => update({ metafields: draft.metafields.filter((_, j) => j !== i) })}>✕</button>
        </div>
      ))}
      <div className="gl-hint">Removing a row here does not delete an existing metafield in Shopify.</div>
    </div>
  );
}

function VariantsSection({ draft, update }: SectionProps) {
  const [optText, setOptText] = useState(() => draft.options.map((o) => o.values.join(", ")));
  const [bulk, setBulk] = useState({ price: "", compareAtPrice: "", quantity: "", cost: "", weight: "" });

  const setOptions = (options: typeof draft.options) => update({ options, variants: regenerateVariants(options, draft.variants) });
  const setVariant = (i: number, patch: Partial<DraftVariant>) => update({ variants: draft.variants.map((v, j) => (j === i ? { ...v, ...patch } : v)) });
  const imageChoices = useMemo(() => draft.images.map((im, i) => ({ src: im.src, label: `Image ${i + 1}` })), [draft.images]);

  const applyBulk = () => {
    update({
      variants: draft.variants.map((v) => ({
        ...v,
        ...(bulk.price ? { price: bulk.price } : {}),
        ...(bulk.compareAtPrice ? { compareAtPrice: bulk.compareAtPrice } : {}),
        ...(bulk.cost ? { cost: bulk.cost } : {}),
        ...(bulk.quantity ? { quantity: Number(bulk.quantity) } : {}),
        ...(bulk.weight ? { weight: Number(bulk.weight) } : {}),
      })),
    });
    setBulk({ price: "", compareAtPrice: "", quantity: "", cost: "", weight: "" });
  };

  const totalStock = draft.variants.reduce((s, v) => s + (Number(v.quantity) || 0), 0);

  return (
    <div className="gl-section">
      <h3>
        Pricing, stock & variants
        <span className="gl-muted" style={{ fontWeight: 400 }}>{draft.variants.length} variant(s) · {totalStock} in stock</span>
        {draft.options.length < 3 && (
          <button className="gl-btn sm" onClick={() => { setOptText([...optText, ""]); setOptions([...draft.options, { name: draft.options.length === 0 ? "Size" : draft.options.length === 1 ? "Color" : "Material", values: [] }]); }}>
            + Add option (size, color…)
          </button>
        )}
      </h3>

      {draft.options.map((o, i) => (
        <div key={i} style={{ display: "grid", gridTemplateColumns: "140px 1fr auto", gap: 6, marginBottom: 6 }}>
          <input className="gl-input" value={o.name} placeholder="Option name"
            onChange={(e) => setOptions(draft.options.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
          <input className="gl-input" value={optText[i] ?? ""} placeholder="Values, comma separated: S, M, L"
            onChange={(e) => { const next = [...optText]; next[i] = e.target.value; setOptText(next); }}
            onBlur={(e) => {
              const values = Array.from(new Set(e.target.value.split(",").map((s) => s.trim()).filter(Boolean)));
              setOptions(draft.options.map((x, j) => (j === i ? { ...x, values } : x)));
            }} />
          <button className="gl-btn sm danger" onClick={() => { setOptText(optText.filter((_, j) => j !== i)); setOptions(draft.options.filter((_, j) => j !== i)); }}>✕</button>
        </div>
      ))}

      {draft.variants.length > 1 && (
        <div style={{ display: "flex", gap: 6, alignItems: "center", margin: "8px 0", flexWrap: "wrap" }}>
          <span className="gl-muted">Apply to all:</span>
          {(["price", "compareAtPrice", "cost", "quantity", "weight"] as const).map((k) => (
            <input key={k} className="gl-input" style={{ width: 90 }} placeholder={{ price: "Sale price", compareAtPrice: "MRP", cost: "Cost", quantity: "Qty", weight: "Weight" }[k]}
              value={bulk[k]} onChange={(e) => setBulk({ ...bulk, [k]: e.target.value })} />
          ))}
          <button className="gl-btn sm" onClick={applyBulk}>Apply</button>
        </div>
      )}

      <div className="gl-table-wrap">
        <table className="gl-vtable">
          <thead>
            <tr>
              {draft.options.length > 0 && <th>Variant</th>}
              <th>Sale price</th>
              <th>MRP / Regular</th>
              <th>Cost</th>
              <th>Qty</th>
              <th>SKU</th>
              <th>Barcode</th>
              <th>Weight</th>
              <th>Unit</th>
              {imageChoices.length > 0 && draft.options.length > 0 && <th>Image</th>}
            </tr>
          </thead>
          <tbody>
            {draft.variants.map((v, i) => (
              <tr key={v.optionValues.join("|") + i}>
                {draft.options.length > 0 && <td style={{ whiteSpace: "nowrap", fontWeight: 600 }}>{v.optionValues.join(" / ")}</td>}
                <td><input inputMode="decimal" value={v.price ?? ""} onChange={(e) => setVariant(i, { price: e.target.value })} /></td>
                <td><input inputMode="decimal" value={v.compareAtPrice ?? ""} onChange={(e) => setVariant(i, { compareAtPrice: e.target.value })} /></td>
                <td><input inputMode="decimal" value={v.cost ?? ""} onChange={(e) => setVariant(i, { cost: e.target.value })} /></td>
                <td><input inputMode="numeric" value={v.quantity ?? ""} placeholder="∞" title="Leave empty to not track stock"
                  onChange={(e) => setVariant(i, { quantity: e.target.value === "" ? null : Math.trunc(Number(e.target.value)) || 0 })} /></td>
                <td><input value={v.sku ?? ""} onChange={(e) => setVariant(i, { sku: e.target.value })} /></td>
                <td><input value={v.barcode ?? ""} onChange={(e) => setVariant(i, { barcode: e.target.value })} /></td>
                <td><input inputMode="decimal" value={v.weight ?? ""} onChange={(e) => setVariant(i, { weight: e.target.value === "" ? null : Number(e.target.value) })} /></td>
                <td>
                  <select value={v.weightUnit ?? "GRAMS"} onChange={(e) => setVariant(i, { weightUnit: e.target.value as any })}>
                    <option value="GRAMS">g</option><option value="KILOGRAMS">kg</option><option value="POUNDS">lb</option><option value="OUNCES">oz</option>
                  </select>
                </td>
                {imageChoices.length > 0 && draft.options.length > 0 && (
                  <td>
                    <select value={v.imageSrc ?? ""} onChange={(e) => setVariant(i, { imageSrc: e.target.value || undefined })}>
                      <option value="">—</option>
                      {imageChoices.map((c) => <option key={c.src} value={c.src}>{c.label}</option>)}
                    </select>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {draft.variants.some((v) => v.price && v.compareAtPrice && Number(v.compareAtPrice) <= Number(v.price)) && (
        <div className="gl-alert warn" style={{ marginTop: 8 }}>MRP should be higher than the sale price to show a discount.</div>
      )}
      <div style={{ display: "flex", gap: 14, marginTop: 8, flexWrap: "wrap" }}>
        <label><input type="checkbox" checked={draft.variants.every((v) => v.taxable !== false)} onChange={(e) => update({ variants: draft.variants.map((v) => ({ ...v, taxable: e.target.checked })) })} /> Charge tax</label>
        <label><input type="checkbox" checked={draft.variants.every((v) => v.requiresShipping !== false)} onChange={(e) => update({ variants: draft.variants.map((v) => ({ ...v, requiresShipping: e.target.checked })) })} /> Physical product (needs shipping)</label>
        <label><input type="checkbox" checked={draft.variants.some((v) => v.continueSellingWhenOutOfStock)} onChange={(e) => update({ variants: draft.variants.map((v) => ({ ...v, continueSellingWhenOutOfStock: e.target.checked })) })} /> Sell when out of stock</label>
      </div>
    </div>
  );
}

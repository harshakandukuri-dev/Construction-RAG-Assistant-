"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import Sheet from "@/components/Sheet";
import DesignForm from "@/components/DesignForm";
import MaterialView from "@/components/MaterialView";
import { FitChip, FitResult, Quality, Thumb } from "@/components/Bits";
import { Icon } from "@/components/Icons";
import { api, downloadFile, postFiles } from "@/lib/api";
import { canManage, useRequireSession } from "@/lib/auth";
import { cap, fileUrl, inr, priceRange } from "@/lib/format";
import { useOptions } from "@/lib/options";

const STATUS = {
  within: "Within budget",
  near: "The upper estimate goes over budget",
  over: "Over budget, even at the lowest prices",
};

function Files({ title, hint, files, kind, accept, designId, manage, onDesign, onError }) {
  const input = useRef(null);
  const [busy, setBusy] = useState(false);

  async function add(list) {
    if (!list.length) return;
    onError("");
    setBusy(true);
    try {
      onDesign(await postFiles(`/designs/${designId}/files/${kind}`, list, "files"));
    } catch (err) {
      onError(err.message);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  async function remove(file) {
    try {
      onDesign(await api(`/designs/${designId}/files/${kind}/${file._id}`, { method: "DELETE" }));
    } catch (err) {
      onError(err.message);
    }
  }

  return (
    <section className="block">
      <div className="block-head">
        <h2 className="section-title">{title}</h2>
        {manage && (
          <>
            <button type="button" className="btn btn-quiet btn-small" disabled={busy} onClick={() => input.current?.click()}>
              <Icon name="upload" size={15} /> {busy ? "Uploading…" : "Upload"}
            </button>
            <input ref={input} type="file" hidden multiple accept={accept} onChange={(e) => add(Array.from(e.target.files))} />
          </>
        )}
      </div>
      {files.length === 0 ? (
        <p className="comp-hint">{manage ? hint : "Nothing has been added yet."}</p>
      ) : (
        <div className="files">
          {files.map((f) => (
            <div key={f._id} className="file">
              <a href={fileUrl(f.url)} target="_blank" rel="noopener noreferrer" aria-label={`Open ${f.name}`} style={{ display: "contents" }}>
                {f.kind === "pdf" ? (
                  <span className="file-pdf">
                    <Icon name="file" size={28} />
                    {f.name}
                  </span>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={fileUrl(f.url)} alt={f.name} loading="lazy" />
                )}
              </a>
              {manage && (
                <button type="button" className="icon-btn file-del" aria-label={`Remove ${f.name}`} onClick={() => remove(f)}>
                  <Icon name="trash" size={15} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function Row({ c, design, manage, explained, onSave, onRemove, onOpen }) {
  const [qty, setQty] = useState(c.quantity ?? "");
  const m = c.material;
  if (!m)
    return (
      <div className="comp">
        <div className="comp-thumb" />
        <div>
          <div className="comp-name">Material removed from the catalogue</div>
          <p className="comp-hint">Remove this line or add a replacement.</p>
        </div>
        {manage && (
          <button type="button" className="icon-btn" aria-label="Remove line" onClick={() => onRemove(c)}>
            <Icon name="trash" size={17} />
          </button>
        )}
      </div>
    );

  const areaUnit = m.unit === "sq ft" || m.unit === "sq m";
  return (
    <div className="comp">
      <Thumb material={m} className="comp-thumb" />
      <div>
        <button type="button" className="link" style={{ fontSize: 17, fontWeight: 600, textAlign: "left" }} onClick={() => onOpen(m)}>
          {m.name}
        </button>
        <div className="comp-hint">
          {m.category}, {priceRange(m)} per {m.unit}
        </div>
        <div className="comp-controls">
          {m.sizes?.length > 0 && (
            <select className="field field-select" aria-label={`Size for ${m.name}`} disabled={!manage} value={c.size || ""} onChange={(e) => onSave(c, { size: e.target.value, quantity: c.quantity })}>
              <option value="">Any size</option>
              {m.sizes.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          )}
          <input
            className="field comp-qty"
            type="number"
            min="0"
            step="any"
            aria-label={`Quantity of ${m.name} in ${m.unit}`}
            placeholder={areaUnit ? "Auto" : "Quantity"}
            disabled={!manage}
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            onBlur={() => String(qty) !== String(c.quantity ?? "") && onSave(c, { size: c.size, quantity: qty })}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          />
          <span className="comp-hint">{m.unit}</span>
          <FitChip fit={c.fit} />
        </div>
        {c.autoQuantity && areaUnit && design.area && <p className="comp-hint">Using the design area of {design.area.toLocaleString("en-IN")} sq ft. Type a quantity to change it.</p>}
        {!c.cost && <p className="comp-hint">Enter a quantity to see the cost.</p>}
        <details className="comp-details">
          <summary>Explained, and why this verdict</summary>
          <div style={{ marginTop: 10 }}>
            {explained?.summary.map((line) => (
              <p key={line} className="about" style={{ marginBottom: 8 }}>
                {line}
              </p>
            ))}
            <FitResult fit={c.fit} />
          </div>
        </details>
      </div>
      <div className="comp-cost">
        {c.cost ? (
          <>
            {inr(c.cost.min)} to {inr(c.cost.max)}
          </>
        ) : (
          <span className="comp-hint">No cost yet</span>
        )}
        {manage && (
          <div>
            <button type="button" className="icon-btn" aria-label={`Remove ${m.name}`} onClick={() => onRemove(c)}>
              <Icon name="trash" size={17} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// Choose a material for the design, see how it fits, then add it.
function Picker({ design, onClose, onAdded }) {
  const options = useOptions();
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [anySetting, setAnySetting] = useState(false);
  const [items, setItems] = useState(null);
  const [chosen, setChosen] = useState(null);
  const [error, setError] = useState("");

  const query = new URLSearchParams({ ...(q && { q }), ...(category && { category }), ...(!anySetting && { domain: design.domain }), sort: "price-asc" }).toString();
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      api(`/materials?${query}`)
        .then((list) => !cancelled && setItems(list))
        .catch((err) => !cancelled && setError(err.message));
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  async function add({ size, quantity }) {
    setError("");
    try {
      onAdded(await api(`/designs/${design._id}/components`, { method: "POST", body: { materialId: chosen._id, size, quantity: quantity || undefined } }));
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <Sheet title={chosen ? "Check and add" : "Add a material"} onClose={onClose}>
      {chosen ? (
        <>
          <div style={{ padding: "16px 24px 0" }}>
            <button type="button" className="link" style={{ fontSize: 15 }} onClick={() => setChosen(null)}>
              <Icon name="back" size={14} /> All materials
            </button>
          </div>
          <MaterialView key={chosen._id} material={chosen} fixedDesign={design} canManage={false} onAdd={add} />
          {error && (
            <p className="form-error" role="alert" style={{ margin: "0 24px 24px" }}>
              {error}
            </p>
          )}
        </>
      ) : (
        <div className="sheet-body">
          <div className="fit-controls" style={{ marginBottom: 0 }}>
            <input className="field field-compact field-search" type="search" placeholder="Search materials" aria-label="Search materials" value={q} onChange={(e) => setQ(e.target.value)} />
            <select className="field field-compact field-select" aria-label="Category" value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">All categories</option>
              {options?.categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <label className="check" style={{ marginTop: -16 }}>
            <input type="checkbox" checked={anySetting} onChange={(e) => setAnySetting(e.target.checked)} />
            Also show materials made for the other setting
          </label>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div style={{ marginTop: -16 }}>
            {items === null && <div className="skeleton" />}
            {items?.length === 0 && <p className="empty-list">No materials match. Try a different search.</p>}
            {items?.map((m) => (
              <button key={m._id} type="button" className="pick-row" onClick={() => setChosen(m)}>
                <Thumb material={m} className="comp-thumb" />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="comp-name" style={{ display: "block" }}>
                    {m.name}
                  </span>
                  <span className="comp-hint">
                    {m.category}, {priceRange(m)} per {m.unit}
                  </span>
                </span>
                <Quality value={m.quality} />
              </button>
            ))}
          </div>
        </div>
      )}
    </Sheet>
  );
}

export default function DesignDetail() {
  const { id } = useParams();
  const router = useRouter();
  const { ready, session } = useRequireSession();
  const manage = canManage(session);

  const [design, setDesign] = useState(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [picking, setPicking] = useState(false);
  const [viewing, setViewing] = useState(null);
  const [making, setMaking] = useState(false);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    api(`/designs/${id}`)
      .then((d) => !cancelled && setDesign(d))
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [id, session]);

  const closePicker = useCallback(() => setPicking(false), []);
  const closeEditor = useCallback(() => setEditing(false), []);
  const closeViewer = useCallback(() => setViewing(null), []);

  async function saveComponent(component, body) {
    setError("");
    try {
      setDesign(await api(`/designs/${id}/components/${component._id}`, { method: "PUT", body }));
    } catch (err) {
      setError(err.message);
    }
  }

  async function removeComponent(component) {
    try {
      setDesign(await api(`/designs/${id}/components/${component._id}`, { method: "DELETE" }));
    } catch (err) {
      setError(err.message);
    }
  }

  async function downloadPdf() {
    setError("");
    setMaking(true);
    try {
      await downloadFile(`/designs/${id}/pdf`, "design-proposal.pdf");
    } catch (err) {
      setError(err.message);
    } finally {
      setMaking(false);
    }
  }

  async function removeDesign() {
    if (!window.confirm(`Delete "${design.name}" with its blueprint and materials list? This can't be undone.`)) return;
    try {
      await api(`/designs/${id}`, { method: "DELETE" });
      router.push("/designs");
    } catch (err) {
      setError(err.message);
    }
  }

  if (!ready || !session) return <Nav />;

  if (!design)
    return (
      <>
        <Nav />
        <main className="wide-page">
          {error ? (
            <>
              <p className="form-error" role="alert">
                {error}
              </p>
              <p style={{ marginTop: 16 }}>
                <Link href="/designs" className="link">
                  Back to designs
                </Link>
              </p>
            </>
          ) : (
            <div className="skeleton" style={{ height: 200 }} />
          )}
        </main>
      </>
    );

  const t = design.totals;
  const pct = (n) => (design.budget ? Math.min(100, (n / design.budget) * 100) : 0);
  const facts = [
    cap(design.domain),
    design.space,
    design.style && cap(design.style),
    design.area && `${design.area.toLocaleString("en-IN")} sq ft`,
    design.dimensions,
    `${cap(design.qualityTarget)} quality`,
    design.wetArea && "Wet area",
    design.highTraffic && "Heavy traffic",
  ].filter(Boolean);

  return (
    <>
      <Nav />
      <main className="wide-page">
        <Link href="/designs" className="link" style={{ fontSize: 15 }}>
          <Icon name="back" size={14} /> Designs
        </Link>
        <div className="block-head" style={{ marginTop: 16, alignItems: "flex-start" }}>
          <div>
            <h1 className="page-title">{design.name}</h1>
            <div className="tags" style={{ marginTop: 14 }}>
              {facts.map((f) => (
                <span key={f} className="tag" style={{ textTransform: "none" }}>
                  {f}
                </span>
              ))}
            </div>
          </div>
          <div className="drop-row" style={{ margin: 0 }}>
            <button type="button" className="btn btn-small" disabled={making} onClick={downloadPdf}>
              {making ? "Preparing PDF…" : "Download PDF"}
            </button>
            {manage && (
              <>
                <button type="button" className="btn btn-quiet btn-small" onClick={() => setEditing(true)}>
                  Edit
                </button>
                <button type="button" className="link link-danger" style={{ fontSize: 15 }} onClick={removeDesign}>
                  Delete
                </button>
              </>
            )}
          </div>
        </div>
        {design.notes && <p className="page-sub">{design.notes}</p>}

        {error && (
          <p className="form-error" role="alert" style={{ margin: "20px 0" }}>
            {error}
          </p>
        )}

        <section className="summary" style={{ marginTop: 32 }} aria-label="Cost estimate">
          <div>
            <div className="fact-label">Estimated cost</div>
            <div className="summary-total">{t.max > 0 ? (t.min === t.max ? inr(t.min) : `${inr(t.min)} to ${inr(t.max)}`) : "Not priced yet"}</div>
          </div>
          {design.budget ? (
            <>
              <div className="budget-bar" data-status={t.budgetStatus} role="img" aria-label={`Estimate compared with a budget of ${inr(design.budget)}`}>
                <div className="budget-max" style={{ width: `${pct(t.max)}%` }} />
                <div className="budget-min" style={{ width: `${pct(t.min)}%` }} />
              </div>
              <p className="comp-hint" style={{ fontSize: 15 }}>
                Budget {inr(design.budget)}.{" "}
                {t.budgetStatus ? STATUS[t.budgetStatus] : "Add materials with quantities to compare against it."}
              </p>
            </>
          ) : (
            <p className="comp-hint">Add a budget to the design to compare against it.</p>
          )}
          {t.byCategory.length > 0 && (
            <ul className="breakdown">
              {t.byCategory.map((row) => (
                <li key={row.category}>
                  <span>{row.category}</span>
                  <span>
                    {inr(row.min)} to {inr(row.max)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="block" aria-labelledby="plain">
          <h2 className="section-title" id="plain">
            In plain words
          </h2>
          {design.explanation.overview.map((text) => (
            <p key={text} className="about" style={{ marginBottom: 12 }}>
              {text}
            </p>
          ))}
          {design.explanation.attention.length > 0 && (
            <>
              <h3 className="section-title" style={{ fontSize: 17, marginTop: 24 }}>
                What needs your attention
              </h3>
              <ul className="fit-list">
                {design.explanation.attention.map((a) => (
                  <li key={`${a.material}-${a.title}`} className="fit-item">
                    <span className="fit-mark" data-status={a.level}>
                      <Icon name={a.level === "fail" ? "close" : "alert"} size={14} stroke={3} />
                    </span>
                    <div>
                      <strong>
                        {a.material}: {a.title}
                      </strong>
                      <span>{a.text}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
          <h3 className="section-title" style={{ fontSize: 17, marginTop: 24 }}>
            Suggested next steps
          </h3>
          <ol className="about" style={{ margin: 0, paddingLeft: 20 }}>
            {design.explanation.nextSteps.map((step) => (
              <li key={step} style={{ marginBottom: 4 }}>
                {step}
              </li>
            ))}
          </ol>
          <p className="comp-hint" style={{ marginTop: 16 }}>
            {design.explanation.notes.join(" ")}
          </p>
        </section>

        <Files title="Blueprint" hint="No blueprint yet. Upload a floor plan or elevation as an image or PDF." files={design.blueprints} kind="blueprints" accept="image/jpeg,image/png,image/webp,application/pdf" designId={id} manage={manage} onDesign={setDesign} onError={setError} />
        <Files title="Reference images" hint="No reference images yet. Upload pictures of the look you want." files={design.references} kind="references" accept="image/jpeg,image/png,image/webp" designId={id} manage={manage} onDesign={setDesign} onError={setError} />

        <section className="block">
          <div className="block-head">
            <h2 className="section-title">Materials and components</h2>
            {manage && (
              <button type="button" className="btn btn-small" onClick={() => setPicking(true)}>
                <Icon name="plus" size={16} /> Add material
              </button>
            )}
          </div>
          {design.components.length === 0 && (
            <p className="comp-hint">{manage ? "No materials chosen yet. Add one to see its price and whether it fits." : "No materials chosen yet."}</p>
          )}
          {design.components.map((c) => (
            <Row key={c._id} c={c} design={design} manage={manage} explained={design.explanation.materials.find((x) => x.componentId === String(c._id))} onSave={saveComponent} onRemove={removeComponent} onOpen={setViewing} />
          ))}
        </section>
      </main>

      {editing && (
        <DesignForm
          design={design}
          onClose={closeEditor}
          onSaved={(saved) => {
            setDesign(saved);
            setEditing(false);
          }}
        />
      )}
      {picking && (
        <Picker
          design={design}
          onClose={closePicker}
          onAdded={(saved) => {
            setDesign(saved);
            setPicking(false);
          }}
        />
      )}
      {viewing && (
        <Sheet title="Material" onClose={closeViewer}>
          <MaterialView key={viewing._id} material={viewing} fixedDesign={design} canManage={false} />
        </Sheet>
      )}
    </>
  );
}

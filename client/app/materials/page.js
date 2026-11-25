"use client";
import { useCallback, useEffect, useState } from "react";
import Nav from "@/components/Nav";
import Sheet from "@/components/Sheet";
import Segmented from "@/components/Segmented";
import MaterialView from "@/components/MaterialView";
import MaterialEditor from "@/components/MaterialEditor";
import { Quality, Thumb } from "@/components/Bits";
import { Icon } from "@/components/Icons";
import { api } from "@/lib/api";
import { canManage, useRequireSession } from "@/lib/auth";
import { cap, priceRange } from "@/lib/format";
import { useOptions } from "@/lib/options";

const EMPTY = { q: "", category: "", domain: "", quality: "", style: "", maxPrice: "", sort: "" };
const SORTS = [
  ["", "Sort by category"],
  ["price-asc", "Price, low to high"],
  ["price-desc", "Price, high to low"],
  ["quality", "Quality"],
  ["name", "Name"],
];

export default function Materials() {
  const { ready, session } = useRequireSession();
  const manage = canManage(session);
  const options = useOptions();

  const [filters, setFilters] = useState(EMPTY);
  const [items, setItems] = useState(null);
  const [designs, setDesigns] = useState([]);
  const [selected, setSelected] = useState(null);
  const [editing, setEditing] = useState(null); // null = closed, {} = new, material = edit
  const [reload, setReload] = useState(0);
  const [error, setError] = useState("");
  const set = (key) => (value) => setFilters((f) => ({ ...f, [key]: value }));

  const query = new URLSearchParams(Object.entries(filters).filter(([, v]) => v)).toString();
  const filtered = query !== "" && query !== new URLSearchParams({ sort: filters.sort }).toString();

  useEffect(() => {
    if (!session) return;
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
  }, [query, session, reload]);

  useEffect(() => {
    if (!session) return;
    api("/designs")
      .then(setDesigns)
      .catch(() => {});
  }, [session]);

  const close = useCallback(() => setSelected(null), []);
  const closeEditor = useCallback(() => setEditing(null), []);

  const replace = (material) => {
    setSelected(material);
    setItems((list) => list && list.map((m) => (m._id === material._id ? material : m)));
  };

  async function loadSamples() {
    setError("");
    try {
      await api("/materials/samples", { method: "POST" });
      setReload((n) => n + 1);
    } catch (err) {
      setError(err.message);
    }
  }

  async function remove(material) {
    if (!window.confirm(`Delete "${material.name}"? Designs that use it will show it as removed.`)) return;
    try {
      await api(`/materials/${material._id}`, { method: "DELETE" });
      setSelected(null);
      setReload((n) => n + 1);
    } catch (err) {
      setError(err.message);
    }
  }

  if (!ready || !session) return <Nav />;

  const empty = items?.length === 0;

  return (
    <>
      <Nav />
      <main className="wide-page">
        <div className="block-head" style={{ alignItems: "flex-end" }}>
          <div>
            <h1 className="page-title">Materials</h1>
            <p className="page-sub">Compare price, quality and performance, then check what suits your design.</p>
          </div>
          {manage && (
            <button type="button" className="btn btn-small" onClick={() => setEditing({})}>
              <Icon name="plus" size={16} /> Add material
            </button>
          )}
        </div>

        <div className="pillbar" role="group" aria-label="Category">
          <button type="button" className="pill" aria-pressed={!filters.category} onClick={() => set("category")("")}>
            All
          </button>
          {options?.categories.map((c) => (
            <button key={c} type="button" className="pill" aria-pressed={filters.category === c} onClick={() => set("category")(c)}>
              {c}
            </button>
          ))}
        </div>

        <div className="filters">
          <input className="field field-compact field-search" type="search" placeholder="Search materials" aria-label="Search materials" value={filters.q} onChange={(e) => set("q")(e.target.value)} />
          <Segmented
            label="Setting"
            value={filters.domain}
            onChange={set("domain")}
            options={[
              { value: "", label: "All" },
              { value: "interior", label: "Interior" },
              { value: "exterior", label: "Exterior" },
            ]}
          />
          <select className="field field-compact field-select" aria-label="Quality" value={filters.quality} onChange={(e) => set("quality")(e.target.value)}>
            <option value="">Any quality</option>
            {options?.qualities.map((q) => (
              <option key={q} value={q}>
                {cap(q)}
              </option>
            ))}
          </select>
          <select className="field field-compact field-select" aria-label="Style" value={filters.style} onChange={(e) => set("style")(e.target.value)}>
            <option value="">Any style</option>
            {options?.styles.map((s) => (
              <option key={s} value={s}>
                {cap(s)}
              </option>
            ))}
          </select>
          <input className="field field-compact" style={{ width: 140 }} type="number" min="0" placeholder="Max price (₹)" aria-label="Maximum starting price" value={filters.maxPrice} onChange={(e) => set("maxPrice")(e.target.value)} />
          <select className="field field-compact field-select" aria-label="Sort" value={filters.sort} onChange={(e) => set("sort")(e.target.value)}>
            {SORTS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        {error && (
          <p className="form-error" role="alert" style={{ marginBottom: 20 }}>
            {error}
          </p>
        )}
        {items?.some((m) => m.sample) && (
          <p className="notice-inline">Prices on sample materials are rough, indicative figures. Replace them with quotes from your suppliers.</p>
        )}

        {items === null && <div className="skeleton" style={{ height: 240 }} />}
        {empty && !filtered && (
          <div className="empty-list">
            <p>No materials in the catalogue yet.</p>
            {session.role === "admin" && (
              <p style={{ marginTop: 14 }}>
                <button type="button" className="btn" onClick={loadSamples}>
                  Load sample materials
                </button>
              </p>
            )}
            {!manage && <p>Ask an administrator to add materials.</p>}
          </div>
        )}
        {empty && filtered && (
          <div className="empty-list">
            <p>No materials match these filters.</p>
            <p style={{ marginTop: 14 }}>
              <button type="button" className="btn btn-quiet" onClick={() => setFilters(EMPTY)}>
                Clear filters
              </button>
            </p>
          </div>
        )}

        <div className="grid">
          {items?.map((m) => (
            <button key={m._id} type="button" className="card" onClick={() => setSelected(m)}>
              <Thumb material={m} className="card-media" />
              <span className="card-body">
                <span className="card-cat">{m.category}</span>
                <span className="card-name">{m.name}</span>
                <span className="card-price">
                  {priceRange(m)} per {m.unit}
                </span>
                <span className="card-foot">
                  <Quality value={m.quality} />
                </span>
              </span>
            </button>
          ))}
        </div>
      </main>

      {selected && !editing && (
        <Sheet title="Material" onClose={close}>
          <MaterialView
            key={selected._id}
            material={selected}
            designs={designs}
            canManage={manage}
            onChanged={replace}
            onEdit={() => setEditing(selected)}
            onDelete={() => remove(selected)}
          />
        </Sheet>
      )}
      {editing && (
        <MaterialEditor
          material={editing._id ? editing : null}
          onClose={closeEditor}
          onSaved={(saved) => {
            setEditing(null);
            setSelected(saved);
            setReload((n) => n + 1);
          }}
        />
      )}
    </>
  );
}

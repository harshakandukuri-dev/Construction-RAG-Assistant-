"use client";
import { useState } from "react";
import Sheet from "./Sheet";
import { api } from "@/lib/api";
import { useOptions } from "@/lib/options";
import { cap } from "@/lib/format";

const RATING = ["1 Poor", "2 Fair", "3 Average", "4 Good", "5 Excellent"];
const RATINGS = [
  ["durability", "Durability"],
  ["waterResistance", "Water resistance"],
  ["weatherResistance", "Weather resistance"],
  ["easeOfUpkeep", "Ease of upkeep"],
];
const join = (list, sep) => (list || []).join(sep);

function start(m) {
  return {
    name: m?.name || "",
    category: m?.category || "Flooring",
    domain: m?.domain || "both",
    brand: m?.brand || "",
    model: m?.model || "",
    quality: m?.quality || "standard",
    unit: m?.unit || "sq ft",
    priceMin: m?.priceMin ?? "",
    priceMax: m?.priceMax ?? "",
    lifespanYears: m?.lifespanYears ?? "",
    swatch: m?.swatch || "#d2d2d7",
    styles: m?.styles || [],
    sizes: join(m?.sizes, ", "),
    durability: m?.durability ?? 3,
    waterResistance: m?.waterResistance ?? 3,
    weatherResistance: m?.weatherResistance ?? 3,
    easeOfUpkeep: m?.easeOfUpkeep ?? 3,
    about: m?.about || "",
    pros: join(m?.pros, "\n"),
    cons: join(m?.cons, "\n"),
    bestFor: join(m?.bestFor, "\n"),
    notFor: join(m?.notFor, "\n"),
  };
}

export default function MaterialEditor({ material, onSaved, onClose }) {
  const options = useOptions();
  const [form, setForm] = useState(() => start(material));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  async function submit(event) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const saved = await api(material ? `/materials/${material._id}` : "/materials", {
        method: material ? "PUT" : "POST",
        body: form,
      });
      onSaved(saved);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  const select = (key, label, values, format = cap) => (
    <div>
      <label className="form-label" htmlFor={`m-${key}`}>
        {label}
      </label>
      <select id={`m-${key}`} className="field field-select" value={form[key]} onChange={set(key)}>
        {values.map((v) => (
          <option key={v} value={v}>
            {format(v)}
          </option>
        ))}
      </select>
    </div>
  );

  const text = (key, label, props = {}) => (
    <div className={props.wide ? "wide" : undefined}>
      <label className="form-label" htmlFor={`m-${key}`}>
        {label}
      </label>
      <input id={`m-${key}`} className="field" value={form[key]} onChange={set(key)} {...props.input} />
    </div>
  );

  const area = (key, label, hint) => (
    <div className="wide">
      <label className="form-label" htmlFor={`m-${key}`}>
        {label} <span style={{ color: "var(--ink-3)" }}>{hint}</span>
      </label>
      <textarea id={`m-${key}`} className="textarea" value={form[key]} onChange={set(key)} />
    </div>
  );

  return (
    <Sheet title={material ? "Edit material" : "New material"} onClose={onClose}>
      <form className="sheet-body" onSubmit={submit}>
        <div className="form-grid">
          {text("name", "Name", { wide: true, input: { required: true, placeholder: "For example, Vitrified tile" } })}
          {options && select("category", "Category", options.categories, (v) => v)}
          {options && select("domain", "Used", options.domains, (v) => (v === "both" ? "Interior and exterior" : cap(v)))}
          {text("brand", "Brand")}
          {text("model", "Model or type")}
          {options && select("quality", "Quality", options.qualities)}
          {options && select("unit", "Priced per", options.units, (v) => v)}
          {text("priceMin", "Lowest price (₹)", { input: { type: "number", min: 0, step: "any", required: true } })}
          {text("priceMax", "Highest price (₹)", { input: { type: "number", min: 0, step: "any", required: true } })}
          {text("lifespanYears", "Lifespan (years)", { input: { type: "number", min: 1 } })}
          <div>
            <label className="form-label" htmlFor="m-swatch">
              Colour shown without a photo
            </label>
            <input id="m-swatch" className="swatch-input" type="color" value={form.swatch} onChange={set("swatch")} />
          </div>

          {options && (
            <div className="wide">
              <span className="form-label">Styles it suits</span>
              <div className="pillbar" style={{ flexWrap: "wrap", margin: 0 }}>
                {options.styles.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className="pill"
                    aria-pressed={form.styles.includes(s)}
                    onClick={() => setForm({ ...form, styles: form.styles.includes(s) ? form.styles.filter((x) => x !== s) : [...form.styles, s] })}
                  >
                    {cap(s)}
                  </button>
                ))}
              </div>
            </div>
          )}
          {text("sizes", "Sizes available", { wide: true, input: { placeholder: "Separate with commas: 600x600 mm, 800x800 mm" } })}

          {RATINGS.map(([key, label]) => (
            <div key={key}>
              <label className="form-label" htmlFor={`m-${key}`}>
                {label}
              </label>
              <select id={`m-${key}`} className="field field-select" value={form[key]} onChange={(e) => setForm({ ...form, [key]: Number(e.target.value) })}>
                {RATING.map((r, i) => (
                  <option key={r} value={i + 1}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
          ))}

          {area("about", "About the material", "")}
          {area("pros", "Strengths", "(one per line)")}
          {area("cons", "Watch out for", "(one per line)")}
          {area("bestFor", "Best for", "(one per line)")}
          {area("notFor", "Not suited for", "(one per line)")}
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="drop-row" style={{ justifyContent: "flex-start", margin: 0 }}>
          <button className="btn" disabled={busy}>
            {busy ? "Saving…" : material ? "Save changes" : "Add material"}
          </button>
          <button type="button" className="btn btn-quiet" onClick={onClose}>
            Cancel
          </button>
        </div>
        {!material && <p className="comp-hint">You can add photos after saving.</p>}
      </form>
    </Sheet>
  );
}

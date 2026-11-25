"use client";
import { useState } from "react";
import Sheet from "./Sheet";
import Segmented from "./Segmented";
import { api } from "@/lib/api";
import { useOptions } from "@/lib/options";
import { cap } from "@/lib/format";

function start(d) {
  return {
    name: d?.name || "",
    space: d?.space || "",
    domain: d?.domain || "interior",
    style: d?.style || "",
    area: d?.area ?? "",
    dimensions: d?.dimensions || "",
    budget: d?.budget ?? "",
    qualityTarget: d?.qualityTarget || "standard",
    wetArea: Boolean(d?.wetArea),
    highTraffic: Boolean(d?.highTraffic),
    notes: d?.notes || "",
  };
}

// Used both to create a design and to edit one.
export default function DesignForm({ design, projects, projectId, onSaved, onClose }) {
  const options = useOptions();
  const [form, setForm] = useState(() => start(design));
  const [project, setProject] = useState(projectId || projects?.[0]?._id || "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  async function submit(event) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const saved = await api(design ? `/designs/${design._id}` : "/designs", {
        method: design ? "PUT" : "POST",
        body: design ? form : { ...form, projectId: project },
      });
      onSaved(saved);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <Sheet title={design ? "Edit design" : "New design"} onClose={onClose}>
      <form className="sheet-body" onSubmit={submit}>
        <div className="form-grid">
          {!design && (
            <div className="wide">
              <label className="form-label" htmlFor="d-project">
                Project
              </label>
              <select id="d-project" className="field field-select" value={project} onChange={(e) => setProject(e.target.value)} required>
                {projects?.map((p) => (
                  <option key={p._id} value={p._id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="wide">
            <label className="form-label" htmlFor="d-name">
              Design name
            </label>
            <input id="d-name" className="field" value={form.name} onChange={set("name")} required placeholder="For example, Living room" />
          </div>
          <div className="wide">
            <span className="form-label">Setting</span>
            <Segmented
              label="Setting"
              value={form.domain}
              onChange={(v) => setForm({ ...form, domain: v })}
              options={[
                { value: "interior", label: "Interior" },
                { value: "exterior", label: "Exterior" },
              ]}
            />
          </div>
          <div>
            <label className="form-label" htmlFor="d-space">
              Room or element
            </label>
            <input id="d-space" className="field" value={form.space} onChange={set("space")} placeholder="Ground floor, front facade" />
          </div>
          <div>
            <label className="form-label" htmlFor="d-style">
              Style
            </label>
            <select id="d-style" className="field field-select" value={form.style} onChange={set("style")}>
              <option value="">Not decided</option>
              {options?.styles.map((s) => (
                <option key={s} value={s}>
                  {cap(s)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="form-label" htmlFor="d-area">
              Area (sq ft)
            </label>
            <input id="d-area" className="field" type="number" min="1" step="any" value={form.area} onChange={set("area")} />
          </div>
          <div>
            <label className="form-label" htmlFor="d-budget">
              Budget (₹)
            </label>
            <input id="d-budget" className="field" type="number" min="0" step="any" value={form.budget} onChange={set("budget")} />
          </div>
          <div className="wide">
            <label className="form-label" htmlFor="d-dimensions">
              Dimensions
            </label>
            <input id="d-dimensions" className="field" value={form.dimensions} onChange={set("dimensions")} placeholder="18 x 14 ft, 10 ft ceiling" />
          </div>
          <div className="wide">
            <span className="form-label">Quality you are aiming for</span>
            <Segmented
              label="Quality target"
              value={form.qualityTarget}
              onChange={(v) => setForm({ ...form, qualityTarget: v })}
              options={(options?.qualities || ["economy", "standard", "premium", "luxury"]).map((q) => ({ value: q, label: cap(q) }))}
            />
          </div>
          <label className="check wide">
            <input type="checkbox" checked={form.wetArea} onChange={(e) => setForm({ ...form, wetArea: e.target.checked })} />
            Wet area, such as a bathroom, kitchen or balcony
          </label>
          <label className="check wide">
            <input type="checkbox" checked={form.highTraffic} onChange={(e) => setForm({ ...form, highTraffic: e.target.checked })} />
            Heavy foot traffic
          </label>
          <div className="wide">
            <label className="form-label" htmlFor="d-notes">
              Notes
            </label>
            <textarea id="d-notes" className="textarea" value={form.notes} onChange={set("notes")} />
          </div>
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="drop-row" style={{ justifyContent: "flex-start", margin: 0 }}>
          <button className="btn" disabled={busy || (!design && !project)}>
            {busy ? "Saving…" : design ? "Save changes" : "Create design"}
          </button>
          <button type="button" className="btn btn-quiet" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </Sheet>
  );
}

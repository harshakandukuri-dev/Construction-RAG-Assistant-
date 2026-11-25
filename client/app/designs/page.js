"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import DesignForm from "@/components/DesignForm";
import { Icon } from "@/components/Icons";
import { api } from "@/lib/api";
import { canManage, useRequireSession } from "@/lib/auth";
import { cap, inr } from "@/lib/format";

const BUDGET = { within: "Within budget", near: "Could go over budget", over: "Over budget" };

export default function Designs() {
  const router = useRouter();
  const { ready, session } = useRequireSession();
  const manage = canManage(session);

  const [projects, setProjects] = useState(null);
  const [projectId, setProjectId] = useState("");
  const [designs, setDesigns] = useState(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    api("/projects")
      .then((list) => {
        if (cancelled) return;
        setProjects(list);
        setProjectId((current) => current || list[0]?._id || "");
      })
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [session]);

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    api(`/designs?projectId=${projectId}`)
      .then((list) => !cancelled && setDesigns(list))
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  if (!ready || !session) return <Nav />;

  return (
    <>
      <Nav />
      <main className="wide-page">
        <div className="block-head" style={{ alignItems: "flex-end" }}>
          <div>
            <h1 className="page-title">Designs</h1>
            <p className="page-sub">A design is a room or facade with its style, size and budget, plus the blueprint and the materials chosen for it.</p>
          </div>
          {manage && projects?.length > 0 && (
            <button type="button" className="btn btn-small" onClick={() => setCreating(true)}>
              <Icon name="plus" size={16} /> New design
            </button>
          )}
        </div>

        <div className="toolbar">
          <select
            className="field field-select"
            aria-label="Project"
            value={projectId}
            onChange={(e) => {
              setDesigns(null);
              setProjectId(e.target.value);
            }}
          >
            {!projects?.length && <option value="">No projects yet</option>}
            {projects?.map((p) => (
              <option key={p._id} value={p._id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        {error && (
          <p className="form-error" role="alert" style={{ marginBottom: 20 }}>
            {error}
          </p>
        )}
        {projects?.length === 0 && <p className="empty-list">Create a project on the Documents page first.</p>}
        {projectId && designs === null && <div className="skeleton" style={{ height: 160 }} />}
        {designs?.length === 0 && (
          <p className="empty-list">{manage ? "No designs yet. Create one to start choosing materials." : "No designs yet."}</p>
        )}

        <div className="design-grid">
          {designs?.map((d) => (
            <button key={d._id} type="button" className="design-card" onClick={() => router.push(`/designs/${d._id}`)}>
              <span className="card-cat">{[cap(d.domain), d.space].filter(Boolean).join(", ")}</span>
              <span className="design-name">{d.name}</span>
              <span className="card-price">
                {[d.style && cap(d.style), d.area && `${d.area.toLocaleString("en-IN")} sq ft`, d.budget && `Budget ${inr(d.budget)}`].filter(Boolean).join(", ") || "No details yet"}
              </span>
              <span className="card-price">
                {d.components} material{d.components === 1 ? "" : "s"}
                {d.totals.max > 0 && `, about ${inr(d.totals.min)} to ${inr(d.totals.max)}`}
              </span>
              {d.totals.budgetStatus && <span className="tag" style={{ width: "fit-content", textTransform: "none" }}>{BUDGET[d.totals.budgetStatus]}</span>}
            </button>
          ))}
        </div>
      </main>

      {creating && (
        <DesignForm
          projects={projects}
          projectId={projectId}
          onClose={() => setCreating(false)}
          onSaved={(saved) => router.push(`/designs/${saved._id}`)}
        />
      )}
    </>
  );
}

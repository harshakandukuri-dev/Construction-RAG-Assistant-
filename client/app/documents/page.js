"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Nav from "@/components/Nav";
import Segmented from "@/components/Segmented";
import { Icon } from "@/components/Icons";
import { api, uploadDocument } from "@/lib/api";
import { canManage, useRequireSession } from "@/lib/auth";

const TYPES = [
  { value: "general", label: "General" },
  { value: "interior", label: "Interior" },
  { value: "exterior", label: "Exterior" },
  { value: "structural", label: "Structural" },
];

const MAX_BYTES = 50 * 1024 * 1024;
const date = (value) => new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

export default function Documents() {
  const { ready, session } = useRequireSession();
  const manage = canManage(session);
  const isAdmin = session?.role === "admin";

  const [projects, setProjects] = useState(null);
  const [projectId, setProjectId] = useState("");
  const [docs, setDocs] = useState(null);
  const [type, setType] = useState("general");
  const [over, setOver] = useState(false);
  const [upload, setUpload] = useState(null); // { name, progress, indexing }
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [copied, setCopied] = useState(false);
  const fileInput = useRef(null);

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

  const loadDocs = useCallback(async (id) => {
    try {
      setDocs(await api(`/documents/${id}`));
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    api(`/documents/${projectId}`)
      .then((list) => !cancelled && setDocs(list))
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  function chooseProject(id) {
    setDocs(null);
    setError("");
    setProjectId(id);
  }

  async function createProject(event) {
    event.preventDefault();
    setError("");
    try {
      const project = await api("/projects", { method: "POST", body: { name: newName } });
      setProjects((list) => [project, ...(list || [])]);
      setNewName("");
      setCreating(false);
      chooseProject(project._id);
    } catch (err) {
      setError(err.message);
    }
  }

  async function removeProject() {
    const project = projects.find((p) => p._id === projectId);
    if (!window.confirm(`Delete "${project.name}" with all its documents and conversations? This can't be undone.`)) return;
    try {
      await api(`/projects/${projectId}`, { method: "DELETE" });
      const rest = projects.filter((p) => p._id !== projectId);
      setProjects(rest);
      chooseProject(rest[0]?._id || "");
      if (!rest.length) setDocs([]);
    } catch (err) {
      setError(err.message);
    }
  }

  async function addFiles(files) {
    setError("");
    for (const file of Array.from(files)) {
      if (!/\.pdf$/i.test(file.name) && file.type !== "application/pdf") {
        setError(`${file.name} isn't a PDF. Only PDF files are supported.`);
        continue;
      }
      if (file.size > MAX_BYTES) {
        setError(`${file.name} is over 50 MB.`);
        continue;
      }
      setUpload({ name: file.name, progress: 0, indexing: false });
      try {
        await uploadDocument({
          file,
          projectId,
          domain: type,
          onProgress: (p) => setUpload({ name: file.name, progress: p, indexing: p >= 1 }),
        });
        await loadDocs(projectId);
        setProjects((list) => list.map((p) => (p._id === projectId ? { ...p, documentCount: p.documentCount + 1 } : p)));
      } catch (err) {
        setError(`${file.name}: ${err.message}`);
      }
    }
    setUpload(null);
    if (fileInput.current) fileInput.current.value = "";
  }

  async function removeDoc(doc) {
    if (!window.confirm(`Remove "${doc.title}"? Its pages will no longer appear in answers.`)) return;
    try {
      await api(`/documents/${doc._id}`, { method: "DELETE" });
      setDocs((list) => list.filter((d) => d._id !== doc._id));
      setProjects((list) => list.map((p) => (p._id === projectId ? { ...p, documentCount: Math.max(0, p.documentCount - 1) } : p)));
    } catch (err) {
      setError(err.message);
    }
  }

  async function copyId() {
    try {
      await navigator.clipboard.writeText(projectId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setError("Couldn't copy. Select the ID in the address bar of the project instead.");
    }
  }

  if (!ready || !session) return <Nav />;

  return (
    <>
      <Nav />
      <main className="page">
        <h1 className="page-title">Documents</h1>
        <p className="page-sub">
          Add specifications, schedules and notes as PDFs. The assistant reads every page so you can ask about them.
        </p>

        <div className="toolbar">
          <select
            className="field field-select"
            aria-label="Project"
            value={projectId}
            onChange={(e) => chooseProject(e.target.value)}
          >
            {!projects?.length && <option value="">No projects yet</option>}
            {projects?.map((p) => (
              <option key={p._id} value={p._id}>
                {p.name}
              </option>
            ))}
          </select>
          <span className="toolbar-spacer" />
          {projectId && manage && (
            <button type="button" className="link" style={{ fontSize: 15 }} onClick={copyId}>
              {copied ? "Copied" : "Copy project ID"}
            </button>
          )}
          {manage && (
            <button type="button" className="btn btn-quiet btn-small" onClick={() => setCreating((v) => !v)}>
              <Icon name="plus" size={16} /> New project
            </button>
          )}
          {isAdmin && projectId && (
            <button type="button" className="link link-danger" style={{ fontSize: 15 }} onClick={removeProject}>
              Delete project
            </button>
          )}
        </div>

        {creating && (
          <form className="inline-form" onSubmit={createProject}>
            <input
              className="field"
              placeholder="Project name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              autoFocus
              required
            />
            <button className="btn btn-small" style={{ minHeight: 44 }}>
              Create project
            </button>
          </form>
        )}

        {error && (
          <p className="form-error" role="alert" style={{ marginBottom: 20 }}>
            {error}
          </p>
        )}

        {manage && projectId && (
          <div
            className="drop"
            data-over={over}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(true);
            }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setOver(false);
              if (!upload) addFiles(e.dataTransfer.files);
            }}
          >
            <Icon name="upload" size={28} />
            <p className="drop-title">{upload ? upload.name : "Drop PDFs here"}</p>
            {upload ? (
              <>
                <p className="doc-meta">
                  {upload.indexing
                    ? "Reading pages and building the index. Large files can take a few minutes."
                    : "Uploading…"}
                </p>
                <div className="progress" role="progressbar" aria-label="Upload progress">
                  <div
                    className="progress-bar"
                    data-busy={upload.indexing}
                    style={{ width: `${Math.round(upload.progress * 100)}%` }}
                  />
                </div>
              </>
            ) : (
              <>
                <p className="doc-meta">Up to 50 MB each. Scanned images need text recognition first.</p>
                <div className="drop-row">
                  <Segmented label="Document type" options={TYPES} value={type} onChange={setType} />
                  <button type="button" className="btn btn-small" onClick={() => fileInput.current?.click()}>
                    Choose files
                  </button>
                </div>
              </>
            )}
            <input
              ref={fileInput}
              type="file"
              accept="application/pdf,.pdf"
              multiple
              hidden
              onChange={(e) => e.target.files.length && addFiles(e.target.files)}
            />
          </div>
        )}

        {!manage && projectId && (
          <p className="doc-meta">Only administrators and engineers can add or remove documents.</p>
        )}

        {projectId && (
          <>
            <h2 className="list-title">In this project</h2>
            {docs === null && <div className="skeleton" />}
            {docs?.length === 0 && <p className="empty-list">No documents yet.</p>}
            {docs?.map((doc) => (
              <div key={doc._id} className="doc">
                <span className="doc-icon">
                  <Icon name="file" size={20} />
                </span>
                <div className="doc-main">
                  <p className="doc-name">{doc.title}</p>
                  <p className="doc-meta">
                    {doc.pages} pages, {doc.chunks} passages, added {date(doc.createdAt)}
                  </p>
                </div>
                <span className="tag">{doc.domain}</span>
                {manage && (
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={`Remove ${doc.title}`}
                    onClick={() => removeDoc(doc)}
                  >
                    <Icon name="trash" size={17} />
                  </button>
                )}
              </div>
            ))}
          </>
        )}

        {projects?.length === 0 && (
          <p className="empty-list">
            {manage ? "Create your first project to start adding documents." : "No projects yet. Ask an administrator to create one."}
          </p>
        )}
      </main>
    </>
  );
}

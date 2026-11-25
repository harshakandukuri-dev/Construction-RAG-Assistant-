"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Nav from "@/components/Nav";
import Answer from "@/components/Answer";
import Segmented from "@/components/Segmented";
import { Icon } from "@/components/Icons";
import { api, streamChat } from "@/lib/api";
import { canManage, useRequireSession } from "@/lib/auth";

const DOMAINS = [
  { value: "", label: "Auto" },
  { value: "interior", label: "Interior" },
  { value: "exterior", label: "Exterior" },
  { value: "structural", label: "Structural" },
];

const SUGGESTIONS = [
  "Which materials are specified for the facade?",
  "What is the finish schedule for the lobby?",
  "Summarize the waterproofing requirements.",
];

// Older conversations were saved without citation numbers.
const numbered = (sources = []) => sources.map((s, i) => ({ n: i + 1, ...s }));

function serviceNotice(health) {
  if (!health) return null;
  if (!health.rag)
    return (
      <>
        The document service isn&apos;t running. In a terminal, open the <code>rag_service</code> folder and run{" "}
        <code>uvicorn app:app --port 8000</code>.
      </>
    );
  if (!health.rag.ollama) return <>Ollama isn&apos;t running. Open the Ollama app, then ask again.</>;
  if (!health.rag.model_installed)
    return (
      <>
        The model <code>{health.rag.model}</code> isn&apos;t installed. Run <code>ollama pull {health.rag.model}</code>.
      </>
    );
  return null;
}

export default function Chat() {
  const { ready, session } = useRequireSession();

  const [projects, setProjects] = useState(null);
  const [projectId, setProjectId] = useState("");
  const [domain, setDomain] = useState("");
  const [chats, setChats] = useState([]);
  const [chatId, setChatId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [health, setHealth] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [drawer, setDrawer] = useState(false);
  const [openCite, setOpenCite] = useState(null); // { index, n }

  const abortRef = useRef(null);
  const threadRef = useRef(null);
  const stickRef = useRef(true);
  const inputRef = useRef(null);

  // Load projects and service status once signed in.
  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    (async () => {
      try {
        const [list, status] = await Promise.all([api("/projects"), api("/health")]);
        if (cancelled) return;
        setProjects(list);
        setHealth(status);
        setProjectId((current) => current || list[0]?._id || "");
      } catch (err) {
        if (!cancelled) setLoadError(err.message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session]);

  const refreshChats = useCallback(async (id) => {
    if (!id) return;
    try {
      setChats(await api(`/chat?projectId=${id}`));
    } catch {
      /* the sidebar is optional */
    }
  }, []);

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    api(`/chat?projectId=${projectId}`)
      .then((list) => !cancelled && setChats(list))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  // Keep the newest text in view unless the person has scrolled up to read.
  useEffect(() => {
    const el = threadRef.current;
    if (el && stickRef.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  function onScroll() {
    const el = threadRef.current;
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  }

  function newChat() {
    abortRef.current?.abort();
    setChatId(null);
    setMessages([]);
    setOpenCite(null);
    setDrawer(false);
    inputRef.current?.focus();
  }

  function chooseProject(id) {
    abortRef.current?.abort();
    setProjectId(id);
    setChatId(null);
    setMessages([]);
    setChats([]);
    setOpenCite(null);
  }

  async function openChat(id) {
    try {
      const chat = await api(`/chat/${id}`);
      abortRef.current?.abort();
      setProjectId(chat.projectId);
      setChatId(chat._id);
      setMessages(
        chat.messages.map((m) => ({ role: m.role, content: m.content, sources: numbered(m.sources) }))
      );
      setOpenCite(null);
      setDrawer(false);
      stickRef.current = true;
    } catch (err) {
      setLoadError(err.message);
    }
  }

  async function removeChat(id) {
    try {
      await api(`/chat/${id}`, { method: "DELETE" });
      setChats((list) => list.filter((c) => c._id !== id));
      if (id === chatId) newChat();
    } catch (err) {
      setLoadError(err.message);
    }
  }

  async function send(text) {
    const question = (text ?? input).trim();
    if (!question || !projectId || busy) return;

    setInput("");
    if (inputRef.current) inputRef.current.style.height = "auto";
    setBusy(true);
    stickRef.current = true;
    const controller = new AbortController();
    abortRef.current = controller;

    setMessages((m) => [
      ...m,
      { role: "user", content: question },
      { role: "assistant", content: "", sources: [], streaming: true, status: "Searching your documents…", question },
    ]);
    const patch = (change) =>
      setMessages((m) => {
        const copy = m.slice();
        copy[copy.length - 1] = { ...copy[copy.length - 1], ...change(copy[copy.length - 1]) };
        return copy;
      });

    try {
      await streamChat(
        { question, projectId, domain: domain || undefined, chatId: chatId || undefined },
        {
          signal: controller.signal,
          onEvent: (ev) => {
            if (ev.type === "queued") {
              const ahead = ev.position - 1;
              patch(() => ({
                status: ahead > 0 ? `Waiting for ${ahead} other question${ahead === 1 ? "" : "s"}…` : "Waiting for your turn…",
              }));
            } else if (ev.type === "meta") {
              const sources = numbered(ev.sources);
              patch(() => ({
                sources,
                status: ev.found ? `Reading ${sources.length} passage${sources.length === 1 ? "" : "s"}…` : "",
              }));
            } else if (ev.type === "token") {
              patch((a) => ({ content: a.content + ev.text, status: "" }));
            } else if (ev.type === "error") {
              throw new Error(ev.message);
            } else if (ev.type === "done" && ev.chatId) {
              setChatId(ev.chatId);
            }
          },
        }
      );
      patch(() => ({ streaming: false, status: "" }));
      refreshChats(projectId);
    } catch (err) {
      if (err.name === "AbortError") patch(() => ({ streaming: false, status: "", stopped: true }));
      else {
        patch(() => ({ streaming: false, status: "", error: err.message || "Something went wrong." }));
        api("/health").then(setHealth).catch(() => {});
      }
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }

  function onKeyDown(event) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      send();
    }
  }

  function onInput(event) {
    setInput(event.target.value);
    event.target.style.height = "auto";
    event.target.style.height = `${event.target.scrollHeight}px`;
  }

  if (!ready || !session) return <Nav />;

  const project = projects?.find((p) => p._id === projectId);
  const notice = serviceNotice(health);
  const noDocuments = project && project.documentCount === 0;

  return (
    <>
      <Nav />
      <div className="app">
        <div className="scrim" data-open={drawer} onClick={() => setDrawer(false)} />
        <aside className="side" data-open={drawer} aria-label="Conversations">
          <div className="side-head">
            <select
              className="field field-select"
              style={{ height: 44 }}
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
            <button type="button" className="btn btn-quiet btn-small" onClick={newChat}>
              <Icon name="plus" size={16} /> New conversation
            </button>
          </div>
          <p className="side-label">Recent</p>
          <div className="history">
            {chats.length === 0 && <p className="side-empty">Your conversations will appear here.</p>}
            {chats.map((c) => (
              <div key={c._id} className="history-item" aria-current={c._id === chatId}>
                <button type="button" className="history-open" onClick={() => openChat(c._id)} title={c.title}>
                  {c.title || "Conversation"}
                </button>
                <button
                  type="button"
                  className="icon-btn history-delete"
                  aria-label={`Delete conversation: ${c.title}`}
                  onClick={() => removeChat(c._id)}
                >
                  <Icon name="trash" size={15} />
                </button>
              </div>
            ))}
          </div>
        </aside>

        <section className="chat">
          <div className="chat-top">
            <button type="button" className="icon-btn" aria-label="Open conversations" onClick={() => setDrawer(true)}>
              <Icon name="menu" />
            </button>
            <span>{project?.name || "Assistant"}</span>
          </div>

          {(notice || loadError) && (
            <p className="notice notice-warn" role="alert">
              {loadError || notice}
            </p>
          )}
          {!notice && noDocuments && (
            <p className="notice">
              This project has no documents yet.{" "}
              {canManage(session) ? (
                <Link href="/documents" className="link" style={{ fontSize: "inherit" }}>
                  Add a PDF
                </Link>
              ) : (
                "Ask an administrator to add one."
              )}
            </p>
          )}

          <div className="thread" ref={threadRef} onScroll={onScroll} role="log" aria-busy={busy}>
            <div className="thread-inner">
              {messages.length === 0 && (
                <div className="empty">
                  <h1 className="empty-title">What would you like to know?</h1>
                  <p className="empty-sub">
                    {projects === null
                      ? "Loading your projects…"
                      : project
                        ? `Ask about anything in ${project.name}.`
                        : canManage(session)
                          ? "Create a project and add a document to begin."
                          : "An administrator needs to create a project first."}
                  </p>
                  {project && !noDocuments && (
                    <div className="suggest">
                      {SUGGESTIONS.map((s) => (
                        <button key={s} type="button" className="suggest-item" onClick={() => send(s)}>
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                  {projects?.length === 0 && canManage(session) && (
                    <div className="suggest">
                      <Link href="/documents" className="btn">
                        Set up a project
                      </Link>
                    </div>
                  )}
                </div>
              )}

              {messages.map((m, index) =>
                m.role === "user" ? (
                  <div key={index} className="bubble">
                    {m.content}
                  </div>
                ) : (
                  <div key={index}>
                    {m.status && (
                      <p className="status" aria-live="polite">
                        <span className="caret" aria-hidden="true" style={{ margin: 0 }} />
                        {m.status}
                      </p>
                    )}
                    {m.content && (
                      <Answer
                        text={m.content}
                        sources={m.sources}
                        streaming={m.streaming}
                        onCite={(n) => setOpenCite((cur) => (cur?.index === index && cur.n === n ? null : { index, n }))}
                      />
                    )}
                    {m.error && (
                      <p className="msg-error" role="alert">
                        {m.error}{" "}
                        {m.question && !busy && (
                          <button
                            type="button"
                            className="link"
                            style={{ fontSize: "inherit" }}
                            onClick={() => {
                              setMessages((list) => list.slice(0, index - 1));
                              send(m.question);
                            }}
                          >
                            Try again
                          </button>
                        )}
                      </p>
                    )}
                    {m.stopped && <p className="stopped">Stopped.</p>}
                    {m.sources?.length > 0 && !m.streaming && (
                      <>
                        <div className="chips">
                          {m.sources.map((s) => (
                            <button
                              key={s.n}
                              type="button"
                              className="chip"
                              aria-expanded={openCite?.index === index && openCite.n === s.n}
                              onClick={() =>
                                setOpenCite((cur) => (cur?.index === index && cur.n === s.n ? null : { index, n: s.n }))
                              }
                            >
                              <span className="chip-n">{s.n}</span>
                              <span className="chip-title">{s.title || "Document"}</span>
                              <span className="chip-page">page {s.page}</span>
                            </button>
                          ))}
                        </div>
                        {openCite?.index === index &&
                          m.sources
                            .filter((s) => s.n === openCite.n)
                            .map((s) => (
                              <div key={s.n} className="snippet">
                                <strong>
                                  {s.title || "Document"}, page {s.page}
                                </strong>
                                {s.snippet ? s.snippet + (s.snippet.length >= 320 ? "…" : "") : "Open the document to read this page."}
                              </div>
                            ))}
                      </>
                    )}
                  </div>
                )
              )}
            </div>
          </div>

          <div className="composer">
            <div className="composer-inner">
              <Segmented label="Document type to search" options={DOMAINS} value={domain} onChange={setDomain} />
              <form
                className="composer-box"
                onSubmit={(e) => {
                  e.preventDefault();
                  send();
                }}
              >
                <textarea
                  ref={inputRef}
                  className="composer-input"
                  rows={1}
                  value={input}
                  onChange={onInput}
                  onKeyDown={onKeyDown}
                  placeholder={projectId ? "Ask about your documents" : "Choose a project first"}
                  disabled={!projectId}
                  aria-label="Your question"
                />
                {busy ? (
                  <button
                    type="button"
                    className="send send-stop"
                    aria-label="Stop answering"
                    onClick={() => abortRef.current?.abort()}
                  >
                    <Icon name="stop" size={16} />
                  </button>
                ) : (
                  <button type="submit" className="send" aria-label="Send" disabled={!input.trim() || !projectId}>
                    <Icon name="arrowUp" size={18} />
                  </button>
                )}
              </form>
              <p className="fine">Answers come from your documents. Check the cited pages for anything important.</p>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}

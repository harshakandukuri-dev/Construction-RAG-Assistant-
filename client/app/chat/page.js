
"use client";

import { useEffect, useState } from "react";

const API = process.env.NEXT_PUBLIC_API || "http://localhost:5000/api";

export default function Chat() {
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState("");
  const [domain, setDomain] = useState("");
  const [chatId, setChatId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function headers() {
    const token =
      typeof window !== "undefined"
        ? localStorage.getItem("token")
        : null;

    return {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }

  useEffect(() => {
    async function loadProjects() {
      try {
        setError("");

        const response = await fetch(`${API}/projects`, {
          headers: headers(),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(
            data.error || data.message || "Failed to load projects"
          );
        }

        const projectList = Array.isArray(data)
          ? data
          : Array.isArray(data.projects)
            ? data.projects
            : Array.isArray(data.data)
              ? data.data
              : [];

        setProjects(projectList);

        if (projectList.length > 0) {
          setProjectId(projectList[0]._id);
        } else {
          setError("No projects found. Check the projects API response.");
        }
      } catch (err) {
        console.error("Failed to load projects:", err);
        setProjects([]);
        setError(err.message || "Could not load projects.");
      }
    }

    loadProjects();
  }, []);

  function handleProjectChange(event) {
    setProjectId(event.target.value);
    setChatId(null);
    setMessages([]);
  }

  async function send(event) {
    event.preventDefault();

    const question = input.trim();

    if (!question || !projectId || loading) return;

    setMessages((current) => [
      ...current,
      { role: "user", content: question },
    ]);
    setInput("");
    setLoading(true);
    setError("");

    try {
      const response = await fetch(`${API}/chat`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({
          question,
          projectId,
          domain: domain || undefined,
          chatId: chatId || undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || data.message || "Failed to get an answer"
        );
      }

      if (data.chatId) {
        setChatId(data.chatId);
      }

      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content: data.answer || "No answer returned.",
          sources: Array.isArray(data.sources) ? data.sources : [],
        },
      ]);
    } catch (err) {
      console.error("Chat request failed:", err);

      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content: `Error: ${err.message || "Unable to contact server."}`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main
      style={{
        maxWidth: 800,
        margin: "30px auto",
        padding: 20,
        fontFamily: "Arial, sans-serif",
        color: "#111827",
      }}
    >
      <h1>Construction RAG Assistant</h1>
      <p>Ask questions about your construction documents.</p>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 10,
          marginBottom: 16,
        }}
      >
        <select
          value={projectId}
          onChange={handleProjectChange}
          style={selectStyle}
        >
          <option value="">
            {projects.length ? "Select a project" : "No projects available"}
          </option>

          {projects.map((project) => (
            <option key={project._id} value={project._id}>
              {project.name || "Untitled project"}
            </option>
          ))}
        </select>

        <select
          value={domain}
          onChange={(event) => setDomain(event.target.value)}
          style={selectStyle}
        >
          <option value="">Auto-detect</option>
          <option value="interior">Interior</option>
          <option value="exterior">Exterior</option>
          <option value="structural">Structural</option>
          <option value="general">General</option>
        </select>

        <button
          type="button"
          onClick={() => {
            setChatId(null);
            setMessages([]);
          }}
          style={secondaryButtonStyle}
        >
          New chat
        </button>
      </div>

      {error && (
        <p
          role="alert"
          style={{
            color: "#b91c1c",
            background: "#fef2f2",
            padding: 10,
            borderRadius: 8,
          }}
        >
          {error}
        </p>
      )}

      <section
        style={{
          minHeight: 300,
          maxHeight: 500,
          overflowY: "auto",
          border: "1px solid #e5e7eb",
          borderRadius: 10,
          padding: 16,
          marginBottom: 16,
        }}
      >
        {messages.length === 0 && (
          <p style={{ color: "#6b7280" }}>
            Try asking: What materials are specified for the facade?
          </p>
        )}

        {messages.map((message, index) => (
          <div
            key={index}
            style={{
              margin: "12px 0",
              textAlign: message.role === "user" ? "right" : "left",
            }}
          >
            <div
              style={{
                display: "inline-block",
                padding: 12,
                borderRadius: 8,
                background:
                  message.role === "user" ? "#dbeafe" : "#f3f4f6",
                maxWidth: "90%",
                whiteSpace: "pre-wrap",
                overflowWrap: "anywhere",
                textAlign: "left",
              }}
            >
              {message.content}
            </div>

            {message.sources?.length > 0 && (
              <p style={{ fontSize: 12, color: "#6b7280" }}>
                Sources:{" "}
                {message.sources
                  .map((source) => `Page ${source.page}`)
                  .join(", ")}
              </p>
            )}
          </div>
        ))}

        {loading && <p>Thinking...</p>}
      </section>

      <form
        onSubmit={send}
        style={{ display: "flex", gap: 10, flexWrap: "wrap" }}
      >
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Ask about project documents..."
          disabled={!projectId || loading}
          style={{
            flex: "1 1 250px",
            padding: 12,
            border: "1px solid #d1d5db",
            borderRadius: 8,
          }}
        />

        <button
          type="submit"
          disabled={!projectId || !input.trim() || loading}
          style={primaryButtonStyle}
        >
          {loading ? "Sending..." : "Send"}
        </button>
      </form>
    </main>
  );
}

const selectStyle = {
  padding: 10,
  border: "1px solid #d1d5db",
  borderRadius: 8,
  background: "#ffffff",
};

const primaryButtonStyle = {
  padding: "11px 20px",
  background: "#2563eb",
  color: "#ffffff",
  border: "none",
  borderRadius: 8,
  cursor: "pointer",
};

const secondaryButtonStyle = {
  padding: "10px 14px",
  background: "#f3f4f6",
  color: "#111827",
  border: "1px solid #d1d5db",
  borderRadius: 8,
  cursor: "pointer",
};

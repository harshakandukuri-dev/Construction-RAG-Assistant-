"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import { api } from "@/lib/api";
import { setSession, useSession } from "@/lib/auth";

export default function Login() {
  const router = useRouter();
  const { session } = useSession();
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (session) router.replace("/chat");
  }, [session, router]);

  const set = (key) => (event) => setForm({ ...form, [key]: event.target.value });
  const registering = mode === "register";

  async function submit(event) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const data = await api(`/auth/${mode}`, { method: "POST", body: form });
      setSession(data);
      router.replace("/chat");
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <>
      <Nav />
      <main className="auth">
        <div className="auth-card">
          <h1 className="auth-title">{registering ? "Create your account" : "Sign in"}</h1>
          <p className="auth-sub">
            {registering ? "It takes a few seconds." : "Use your Construction RAG account."}
          </p>

          <form className="form" onSubmit={submit}>
            {registering && (
              <input
                className="field"
                placeholder="Name"
                autoComplete="name"
                value={form.name}
                onChange={set("name")}
              />
            )}
            <input
              className="field"
              type="email"
              placeholder="Email"
              autoComplete="email"
              required
              value={form.email}
              onChange={set("email")}
            />
            <input
              className="field"
              type="password"
              placeholder={registering ? "Password (8 characters or more)" : "Password"}
              autoComplete={registering ? "new-password" : "current-password"}
              required
              value={form.password}
              onChange={set("password")}
            />
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <button className="btn btn-block" disabled={busy}>
              {busy ? "One moment…" : registering ? "Create account" : "Sign in"}
            </button>
            {registering && <p className="form-hint">The first account created becomes the administrator.</p>}
          </form>

          <p className="auth-switch">
            {registering ? "Already have an account? " : "New here? "}
            <button
              type="button"
              className="link"
              style={{ fontSize: "inherit" }}
              onClick={() => {
                setMode(registering ? "login" : "register");
                setError("");
              }}
            >
              {registering ? "Sign in" : "Create an account"}
            </button>
          </p>
        </div>
      </main>
    </>
  );
}

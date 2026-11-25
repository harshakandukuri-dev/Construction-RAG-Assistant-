"use client";
import { useEffect, useMemo, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";

const KEY = "session";

function subscribe(callback) {
  window.addEventListener("storage", callback);
  window.addEventListener("session-change", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("session-change", callback);
  };
}

const read = () => localStorage.getItem(KEY) ?? "";
const readOnServer = () => undefined; // marks "not loaded yet" until the browser takes over

export function getSession() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "null");
  } catch {
    return null;
  }
}

export function setSession(session) {
  localStorage.setItem(KEY, JSON.stringify(session));
  window.dispatchEvent(new Event("session-change"));
}

export function clearSession() {
  localStorage.removeItem(KEY);
  window.dispatchEvent(new Event("session-change"));
}

export function useSession() {
  const raw = useSyncExternalStore(subscribe, read, readOnServer);
  const session = useMemo(() => {
    try {
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }, [raw]);
  return { ready: raw !== undefined, session };
}

// Sends signed-out visitors to the sign-in page.
export function useRequireSession() {
  const router = useRouter();
  const state = useSession();
  useEffect(() => {
    if (state.ready && !state.session) router.replace("/login");
  }, [state.ready, state.session, router]);
  return state;
}

export const canManage = (session) => session?.role === "admin" || session?.role === "engineer";

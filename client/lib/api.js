import { getSession, clearSession } from "./auth";

export const API = process.env.NEXT_PUBLIC_API || "http://localhost:5000/api";

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

const offline = () =>
  new ApiError(`Can't reach the server at ${API.replace(/\/api$/, "")}. Check that it is running.`, 0);

function headers(json) {
  const token = getSession()?.token;
  return {
    ...(json ? { "Content-Type": "application/json" } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function failure(res) {
  const data = await res.json().catch(() => null);
  if (res.status === 401) clearSession();
  return new ApiError(data?.error || "Something went wrong. Try again.", res.status);
}

export async function api(path, { method = "GET", body, signal } = {}) {
  let res;
  try {
    res = await fetch(API + path, {
      method,
      headers: headers(body !== undefined),
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (err) {
    throw err.name === "AbortError" ? err : offline();
  }
  if (!res.ok) throw await failure(res);
  return res.json();
}

// Reads the answer as it is generated. Calls onEvent for every event
// (queued, meta, token, done, error).
export async function streamChat(body, { signal, onEvent }) {
  let res;
  try {
    res = await fetch(`${API}/chat/stream`, {
      method: "POST",
      headers: headers(true),
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    throw err.name === "AbortError" ? err : offline();
  }
  if (!res.ok) throw await failure(res);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let end;
    while ((end = buffer.indexOf("\n\n")) >= 0) {
      const block = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      const line = block.split("\n").find((l) => l.startsWith("data: "));
      if (line) onEvent(JSON.parse(line.slice(6)));
    }
  }
}

// XMLHttpRequest is used here because fetch cannot report upload progress.
export function uploadDocument({ file, projectId, domain, onProgress }) {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append("projectId", projectId);
    form.append("domain", domain);
    form.append("file", file);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API}/documents`);
    const token = getSession()?.token;
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    xhr.upload.onload = () => onProgress?.(1);
    xhr.onerror = () => reject(offline());
    xhr.onload = () => {
      let data = null;
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        /* not JSON */
      }
      if (xhr.status >= 200 && xhr.status < 300) return resolve(data);
      if (xhr.status === 401) clearSession();
      reject(new ApiError(data?.error || "The upload failed. Try again.", xhr.status));
    };
    xhr.send(form);
  });
}

// Uploads one or more files in a single request (photos, blueprints).
export async function postFiles(path, files, field) {
  const form = new FormData();
  for (const file of files) form.append(field, file);
  let res;
  try {
    res = await fetch(API + path, { method: "POST", headers: headers(false), body: form });
  } catch {
    throw offline();
  }
  if (!res.ok) throw await failure(res);
  return res.json();
}

// Downloads a file that needs the sign-in token (so a plain link can't be used).
export async function downloadFile(path, fallbackName) {
  let res;
  try {
    res = await fetch(API + path, { headers: headers(false) });
  } catch {
    throw offline();
  }
  if (!res.ok) throw await failure(res);
  const blob = await res.blob();
  const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") || "")?.[1] || fallbackName;
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

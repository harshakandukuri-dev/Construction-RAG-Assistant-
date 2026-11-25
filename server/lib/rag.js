import axios from "axios";
import { StringDecoder } from "node:string_decoder";

const base = () => process.env.RAG_URL || "http://127.0.0.1:8000";

export async function ragHealth() {
  try {
    const { data } = await axios.get(`${base()}/health`, { timeout: 2500 });
    return data;
  } catch {
    return null;
  }
}

export const ragIngest = (body) =>
  axios.post(`${base()}/ingest`, body, { timeout: 15 * 60 * 1000 }).then((r) => r.data);

export async function ragDeleteDocument(docId) {
  try {
    await axios.delete(`${base()}/documents/${docId}`, { timeout: 30000 });
  } catch (err) {
    console.warn(`Could not remove ${docId} from the vector index:`, err.message);
  }
}

// Turns an axios/Python failure into something a person can act on.
export function ragErrorMessage(err) {
  if (err?.code === "ECONNREFUSED" || err?.code === "ECONNRESET") {
    return "The document service isn't running. Start it with: uvicorn app:app --port 8000";
  }
  const detail = err?.response?.data?.detail;
  return (typeof detail === "string" && detail) || err?.message || "The document service failed.";
}

async function readAll(stream) {
  let text = "";
  const decoder = new StringDecoder("utf8");
  for await (const chunk of stream) text += decoder.write(chunk);
  return text + decoder.end();
}

// Yields the newline-delimited JSON events produced by the Python service.
export async function* ragStream(payload, signal) {
  const res = await axios.post(`${base()}/query/stream`, payload, {
    responseType: "stream",
    signal,
    timeout: 5 * 60 * 1000,
    validateStatus: () => true,
  });

  if (res.status >= 400) {
    const body = await readAll(res.data);
    let detail;
    try {
      detail = JSON.parse(body).detail;
    } catch {
      /* not JSON */
    }
    throw new Error(typeof detail === "string" ? detail : `Document service returned ${res.status}.`);
  }

  const decoder = new StringDecoder("utf8");
  let buffer = "";
  for await (const chunk of res.data) {
    buffer += decoder.write(chunk);
    let nl;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (line) yield JSON.parse(line);
    }
  }
  buffer += decoder.end();
  if (buffer.trim()) yield JSON.parse(buffer);
}

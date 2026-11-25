import { Router } from "express";
import mongoose from "mongoose";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import Chat from "../models/Chat.js";
import Project from "../models/Project.js";
import Document, { DOMAINS } from "../models/Document.js";
import { auth } from "../middleware/auth.js";
import { queue } from "../lib/queue.js";
import { ragStream, ragErrorMessage } from "../lib/rag.js";
import { httpError } from "../lib/http.js";

const router = Router();
const WINDOW = 10; // last 10 messages = 5 question-and-answer turns

const limiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 60,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id || ipKeyGenerator(req.ip),
  message: { error: "You're asking very quickly. Wait a moment and try again." },
});

// Validates the request and loads (or starts) the conversation.
async function prepare(req) {
  const { question, projectId, domain, chatId } = req.body ?? {};
  const q = typeof question === "string" ? question.trim() : "";
  if (!q) throw httpError(400, "Type a question first.");
  if (q.length > 2000) throw httpError(400, "Questions can be up to 2,000 characters.");

  let chat;
  if (chatId) {
    if (!mongoose.isValidObjectId(chatId)) throw httpError(404, "Conversation not found.");
    chat = await Chat.findOne({ _id: chatId, user: req.user.id });
    if (!chat) throw httpError(404, "Conversation not found.");
  } else {
    if (!mongoose.isValidObjectId(projectId) || !(await Project.exists({ _id: projectId })))
      throw httpError(400, "Choose a project first.");
    // Not saved until the first answer succeeds, so failures leave no empty chats.
    chat = new Chat({ user: req.user.id, projectId: String(projectId), title: q.slice(0, 60) });
  }

  const history = chat.messages.slice(-WINDOW).map((m) => ({ role: m.role, content: m.content }));
  const payload = {
    question: q,
    project_id: chat.projectId,
    domain: DOMAINS.includes(domain) ? domain : undefined,
    history,
  };
  return { chat, q, payload };
}

// Older documents were indexed without a title; look it up so sources stay readable.
async function withTitles(sources = []) {
  const missing = sources.filter((s) => !s.title && mongoose.isValidObjectId(s.doc_id)).map((s) => s.doc_id);
  if (!missing.length) return sources;
  const docs = await Document.find({ _id: { $in: missing } }).select("title");
  const titles = new Map(docs.map((d) => [String(d._id), d.title]));
  return sources.map((s) => (s.title ? s : { ...s, title: titles.get(String(s.doc_id)) || "Document" }));
}

// Runs one question through the shared queue and reports events as they arrive.
async function answer(payload, signal, emit) {
  if (queue.pending >= queue.concurrency) emit({ type: "queued", position: queue.size + 1 });

  let text = "";
  let meta = null;
  let finished = false;

  await queue.add(
    async () => {
      for await (const ev of ragStream(payload, signal)) {
        if (ev.type === "meta") {
          meta = { ...ev, sources: await withTitles(ev.sources) };
          emit(meta);
        } else if (ev.type === "token") {
          text += ev.text;
          emit(ev);
        } else if (ev.type === "error") {
          throw new Error(ev.message);
        } else if (ev.type === "done") {
          finished = true;
        }
      }
    },
    { signal }
  );

  if (!finished || !meta) throw new Error("The answer stopped early. Try asking again.");
  return { text, meta };
}

async function save(chat, q, text, meta) {
  chat.messages.push(
    { role: "user", content: q },
    { role: "assistant", content: text, sources: meta.sources }
  );
  await chat.save();
}

// Streaming endpoint used by the web app (Server-Sent Events).
router.post("/stream", auth, limiter, async (req, res) => {
  const { chat, q, payload } = await prepare(req);

  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);

  // Stop generating if the person closes the tab or presses Stop.
  const controller = new AbortController();
  res.on("close", () => {
    if (!res.writableEnded) controller.abort();
  });

  try {
    const { text, meta } = await answer(payload, controller.signal, send);
    await save(chat, q, text, meta);
    send({ type: "done", chatId: String(chat._id) });
  } catch (err) {
    if (!controller.signal.aborted) send({ type: "error", message: ragErrorMessage(err) });
  } finally {
    res.end();
  }
});

// Plain JSON endpoint (no streaming) for scripts and quick tests.
router.post("/", auth, limiter, async (req, res) => {
  const { chat, q, payload } = await prepare(req);
  try {
    const { text, meta } = await answer(payload, undefined, () => {});
    await save(chat, q, text, meta);
    res.json({ chatId: chat._id, answer: text, sources: meta.sources, domain: meta.domain });
  } catch (err) {
    throw httpError(502, ragErrorMessage(err));
  }
});

router.get("/", auth, async (req, res) => {
  const filter = { user: req.user.id };
  if (req.query.projectId) filter.projectId = String(req.query.projectId);
  res.json(await Chat.find(filter).select("title projectId updatedAt").sort("-updatedAt").limit(100));
});

router.get("/:id", auth, async (req, res) => {
  const chat = await Chat.findOne({ _id: req.params.id, user: req.user.id });
  if (!chat) throw httpError(404, "Conversation not found.");
  res.json(chat);
});

router.delete("/:id", auth, async (req, res) => {
  const chat = await Chat.findOneAndDelete({ _id: req.params.id, user: req.user.id });
  if (!chat) throw httpError(404, "Conversation not found.");
  res.json({ ok: true });
});

export default router;

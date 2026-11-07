import { Router } from "express";
import axios from "axios";
import PQueue from "p-queue";
import Chat from "../models/Chat.js";
import { auth } from "../middleware/auth.js";

const router = Router();
// Limits simultaneous LLM calls so Ollama isn't overwhelmed; extra requests wait their turn
const queue = new PQueue({ concurrency: 2 });
const WINDOW = 10; // last 10 messages = 5 turns

router.post("/", auth, async (req, res) => {
  const { question, projectId, domain, chatId } = req.body;
  let chat = chatId
    ? await Chat.findOne({ _id: chatId, user: req.user.id })
    : await Chat.create({ user: req.user.id, projectId, messages: [] });
  if (!chat) return res.status(404).json({ error: "Chat not found" });

  const history = chat.messages.slice(-WINDOW).map(m => ({ role: m.role, content: m.content }));
  try {
    const { data } = await queue.add(() =>
      axios.post(`${process.env.RAG_URL}/query`,
        { question, project_id: chat.projectId, domain, history }, { timeout: 180000 }));
    chat.messages.push(
      { role: "user", content: question },
      { role: "assistant", content: data.answer, sources: data.sources });
    await chat.save();
    res.json({ chatId: chat._id, answer: data.answer, sources: data.sources, domain: data.domain });
  } catch (err) {
    res.status(500).json({ error: "RAG service error", detail: err.message });
  }
});

router.get("/", auth, async (req, res) =>
  res.json(await Chat.find({ user: req.user.id }).select("projectId updatedAt").sort("-updatedAt")));

router.get("/:id", auth, async (req, res) =>
  res.json(await Chat.findOne({ _id: req.params.id, user: req.user.id })));

export default router;
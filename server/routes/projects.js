import { Router } from "express";
import fs from "node:fs/promises";
import Project from "../models/Project.js";
import Document from "../models/Document.js";
import Chat from "../models/Chat.js";
import { auth, requireRole } from "../middleware/auth.js";
import { ragDeleteDocument } from "../lib/rag.js";
import { httpError } from "../lib/http.js";

const router = Router();

router.get("/", auth, async (req, res) => {
  const [projects, counts] = await Promise.all([
    Project.find().sort("-createdAt").lean(),
    Document.aggregate([{ $group: { _id: "$project", n: { $sum: 1 } } }]),
  ]);
  const byProject = new Map(counts.map((c) => [String(c._id), c.n]));
  res.json(projects.map((p) => ({ ...p, documentCount: byProject.get(String(p._id)) || 0 })));
});

router.post("/", auth, requireRole("admin", "engineer"), async (req, res) => {
  const name = String(req.body?.name ?? "").trim();
  if (!name) throw httpError(400, "Give the project a name.");
  const project = await Project.create({
    name: name.slice(0, 80),
    description: String(req.body?.description ?? "").slice(0, 300),
    createdBy: req.user.id,
  });
  res.status(201).json({ ...project.toObject(), documentCount: 0 });
});

router.delete("/:id", auth, requireRole("admin"), async (req, res) => {
  const project = await Project.findById(req.params.id);
  if (!project) throw httpError(404, "Project not found.");
  const docs = await Document.find({ project: project._id });
  for (const doc of docs) {
    await ragDeleteDocument(String(doc._id));
    if (doc.filePath) await fs.rm(doc.filePath, { force: true });
  }
  await Document.deleteMany({ project: project._id });
  await Chat.deleteMany({ projectId: String(project._id) });
  await project.deleteOne();
  res.json({ ok: true });
});

export default router;

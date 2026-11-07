import { Router } from "express";
import multer from "multer";
import path from "path";
import axios from "axios";
import Document from "../models/Document.js";
import { auth, requireRole } from "../middleware/auth.js";

const upload = multer({ dest: "uploads/", limits: { fileSize: 50 * 1024 * 1024 } });
const router = Router();

router.post("/", auth, requireRole("admin", "engineer"), upload.single("file"), async (req, res) => {
  const { projectId, domain = "general" } = req.body;
  const filePath = path.resolve(req.file.path);
  const doc = await Document.create({
    project: projectId, title: req.file.originalname, filePath,
    domain, uploadedBy: req.user.id,
  });
  try {
    const { data } = await axios.post(`${process.env.RAG_URL}/ingest`, {
      file_path: filePath, doc_id: String(doc._id), project_id: projectId, domain,
    }, { timeout: 600000 });
    doc.pages = data.pages; doc.chunks = data.chunks;
    await doc.save();
    res.status(201).json(doc);
  } catch (err) {
    await doc.deleteOne();
    res.status(500).json({ error: "Ingestion failed", detail: err.message });
  }
});

router.get("/:projectId", auth, async (req, res) =>
  res.json(await Document.find({ project: req.params.projectId })));

export default router;
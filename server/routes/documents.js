import { Router } from "express";
import multer from "multer";
import fs from "node:fs/promises";
import path from "node:path";
import mongoose from "mongoose";
import Document, { DOMAINS } from "../models/Document.js";
import Project from "../models/Project.js";
import { auth, requireRole } from "../middleware/auth.js";
import { ragIngest, ragDeleteDocument, ragErrorMessage } from "../lib/rag.js";
import { httpError } from "../lib/http.js";

const upload = multer({
  dest: path.resolve(process.env.UPLOAD_DIR || "uploads"),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) =>
    file.mimetype === "application/pdf" || /\.pdf$/i.test(file.originalname)
      ? cb(null, true)
      : cb(httpError(400, "Only PDF files are supported.")),
});

const router = Router();

router.post("/", auth, requireRole("admin", "engineer"), upload.single("file"), async (req, res) => {
  const file = req.file;
  const cleanup = () => (file ? fs.rm(file.path, { force: true }) : undefined);

  try {
    const { projectId, domain = "general" } = req.body ?? {};
    if (!file) throw httpError(400, "Choose a PDF to upload.");
    if (!mongoose.isValidObjectId(projectId) || !(await Project.exists({ _id: projectId })))
      throw httpError(400, "Choose a project first.");
    if (!DOMAINS.includes(domain)) throw httpError(400, "Pick interior, exterior, structural or general.");

    const doc = await Document.create({
      project: projectId,
      title: file.originalname,
      filePath: path.resolve(file.path),
      size: file.size,
      domain,
      uploadedBy: req.user.id,
    });

    try {
      const data = await ragIngest({
        file_path: doc.filePath,
        doc_id: String(doc._id),
        project_id: String(projectId),
        domain,
        title: doc.title,
      });
      doc.pages = data.pages;
      doc.chunks = data.chunks;
      await doc.save();
      res.status(201).json(doc);
    } catch (err) {
      await doc.deleteOne();
      // The document service says 4xx when the file itself is the problem (for example a scanned PDF).
      const status = err.response?.status;
      throw httpError(status >= 400 && status < 500 ? status : 502, ragErrorMessage(err));
    }
  } catch (err) {
    if (!res.headersSent) await cleanup();
    throw err;
  }
});

router.get("/:projectId", auth, async (req, res) => {
  res.json(await Document.find({ project: req.params.projectId }).sort("-createdAt"));
});

router.delete("/:id", auth, requireRole("admin", "engineer"), async (req, res) => {
  const doc = await Document.findById(req.params.id);
  if (!doc) throw httpError(404, "Document not found.");
  await ragDeleteDocument(String(doc._id));
  if (doc.filePath) await fs.rm(doc.filePath, { force: true });
  await doc.deleteOne();
  res.json({ ok: true });
});

export default router;

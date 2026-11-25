import { Router } from "express";
import mongoose from "mongoose";
import Design from "../models/Design.js";
import Material from "../models/Material.js";
import Project from "../models/Project.js";
import { auth, requireRole } from "../middleware/auth.js";
import { cleanDesign, cleanComponent } from "../lib/clean.js";
import { checkFit, quantityFor, lineCost, designTotals } from "../lib/fit.js";
import { blueprintUpload, accept, removeMedia } from "../lib/media.js";
import { explainDesign } from "../lib/explain.js";
import { buildDesignPdf } from "../lib/pdf.js";
import User from "../models/User.js";
import { httpError } from "../lib/http.js";

const router = Router();
const manage = requireRole("admin", "engineer");
const KINDS = ["blueprints", "references"];

// Adds the cost and fit result to every component, and totals for the whole design.
function present(doc, { explain = true } = {}) {
  const design = doc.toObject();
  design.components = design.components.map((c) => {
    const material = c.material && c.material._id ? c.material : null;
    if (!material) return { ...c, material: null, cost: null, fit: null };
    const qty = quantityFor(material, design, c);
    return {
      ...c,
      material,
      qty,
      autoQuantity: !(c.quantity > 0),
      cost: lineCost(material, qty),
      fit: checkFit(material, design, c),
    };
  });
  design.totals = designTotals(design.components.filter((c) => c.material), design.budget);
  if (explain) design.explanation = explainDesign(design);
  return design;
}

const load = async (id) => {
  if (!mongoose.isValidObjectId(id)) throw httpError(404, "Design not found.");
  const doc = await Design.findById(id).populate("components.material");
  if (!doc) throw httpError(404, "Design not found.");
  return doc;
};

router.get("/", auth, async (req, res) => {
  const filter = mongoose.isValidObjectId(req.query.projectId) ? { project: req.query.projectId } : {};
  const docs = await Design.find(filter).sort("-updatedAt").populate("components.material");
  res.json(docs.map((doc) => {
    const d = present(doc, { explain: false });
    return { ...d, components: d.components.length, blueprints: d.blueprints.length };
  }));
});

router.get("/:id", auth, async (req, res) => res.json(present(await load(req.params.id))));

// A printable proposal of everything chosen for this design. Any signed-in person can download it.
router.get("/:id/pdf", auth, async (req, res) => {
  const doc = await load(req.params.id);
  const [project, user] = await Promise.all([Project.findById(doc.project).lean(), User.findById(req.user.id).select("name").lean()]);
  const pdf = await buildDesignPdf({ design: present(doc), project, preparedBy: user?.name });
  const file = `${doc.name.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "design"}-proposal.pdf`;
  res.set({
    "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename="${file}"`,
    "Content-Length": pdf.length,
    "Cache-Control": "no-store",
  });
  res.send(pdf);
});

router.post("/", auth, manage, async (req, res) => {
  const { projectId } = req.body ?? {};
  if (!mongoose.isValidObjectId(projectId) || !(await Project.exists({ _id: projectId }))) throw httpError(400, "Choose a project first.");
  const doc = await Design.create({ ...cleanDesign(req.body), project: projectId, createdBy: req.user.id });
  res.status(201).json(present(await load(doc.id)));
});

router.put("/:id", auth, manage, async (req, res) => {
  const doc = await load(req.params.id);
  doc.set(cleanDesign(req.body));
  await doc.save();
  res.json(present(doc));
});

router.delete("/:id", auth, manage, async (req, res) => {
  const doc = await load(req.params.id);
  await removeMedia([...doc.blueprints, ...doc.references]);
  await doc.deleteOne();
  res.json({ ok: true });
});

// Blueprint drawings and reference images
router.post("/:id/files/:kind", auth, manage, blueprintUpload.array("files", 6), async (req, res) => {
  const files = await accept(req.files);
  if (!KINDS.includes(req.params.kind)) {
    await removeMedia(files);
    throw httpError(404, "Not found.");
  }
  if (!files.length) throw httpError(400, "Choose at least one file.");
  let doc;
  try {
    doc = await load(req.params.id);
  } catch (err) {
    await removeMedia(files);
    throw err;
  }
  if (req.params.kind === "references" && files.some((f) => f.kind === "pdf")) {
    await removeMedia(files);
    throw httpError(400, "Reference pictures must be images.");
  }
  doc[req.params.kind].push(...files);
  await doc.save();
  res.status(201).json(present(doc));
});

router.delete("/:id/files/:kind/:fileId", auth, manage, async (req, res) => {
  if (!KINDS.includes(req.params.kind)) throw httpError(404, "Not found.");
  const doc = await load(req.params.id);
  const file = doc[req.params.kind].id(req.params.fileId);
  if (!file) throw httpError(404, "File not found.");
  await removeMedia([file]);
  file.deleteOne();
  await doc.save();
  res.json(present(doc));
});

// Components: the materials chosen for this design
router.post("/:id/components", auth, manage, async (req, res) => {
  const { materialId } = req.body ?? {};
  if (!mongoose.isValidObjectId(materialId) || !(await Material.exists({ _id: materialId }))) throw httpError(400, "Choose a material.");
  const doc = await load(req.params.id);
  doc.components.push({ material: materialId, ...cleanComponent(req.body) });
  await doc.save();
  res.status(201).json(present(await load(doc.id)));
});

router.put("/:id/components/:componentId", auth, manage, async (req, res) => {
  const doc = await load(req.params.id);
  const component = doc.components.id(req.params.componentId);
  if (!component) throw httpError(404, "Component not found.");
  component.set(cleanComponent(req.body));
  await doc.save();
  res.json(present(await load(doc.id)));
});

router.delete("/:id/components/:componentId", auth, manage, async (req, res) => {
  const doc = await load(req.params.id);
  const component = doc.components.id(req.params.componentId);
  if (!component) throw httpError(404, "Component not found.");
  component.deleteOne();
  await doc.save();
  res.json(present(await load(doc.id)));
});

export default router;

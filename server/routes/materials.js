import { Router } from "express";
import mongoose from "mongoose";
import Material, { CATEGORIES, DOMAINS, QUALITY, STYLES, UNITS } from "../models/Material.js";
import Design from "../models/Design.js";
import { auth, requireRole } from "../middleware/auth.js";
import { cleanMaterial } from "../lib/clean.js";
import { checkFit } from "../lib/fit.js";
import { imageUpload, accept, removeMedia } from "../lib/media.js";
import { sampleMaterials } from "../data/sampleMaterials.js";
import { httpError } from "../lib/http.js";

const router = Router();
const manage = requireRole("admin", "engineer");
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

router.get("/options", auth, (req, res) => res.json({ categories: CATEGORIES, domains: DOMAINS, qualities: QUALITY, styles: STYLES, units: UNITS }));

router.get("/", auth, async (req, res) => {
  const { q, category, domain, quality, style, maxPrice, sort } = req.query;
  const filter = {};
  if (q) {
    const re = new RegExp(escapeRegex(String(q).slice(0, 60)), "i");
    filter.$or = [{ name: re }, { brand: re }, { category: re }, { about: re }, { model: re }];
  }
  if (CATEGORIES.includes(category)) filter.category = category;
  if (["interior", "exterior"].includes(domain)) filter.domain = { $in: [domain, "both"] };
  if (QUALITY.includes(quality)) filter.quality = quality;
  if (STYLES.includes(style)) filter.styles = style;
  if (Number(maxPrice) > 0) filter.priceMin = { $lte: Number(maxPrice) };

  const items = await Material.find(filter).limit(500).lean();
  const sorters = {
    "price-asc": (a, b) => a.priceMin - b.priceMin,
    "price-desc": (a, b) => b.priceMax - a.priceMax,
    quality: (a, b) => QUALITY.indexOf(b.quality) - QUALITY.indexOf(a.quality) || a.priceMin - b.priceMin,
    name: (a, b) => a.name.localeCompare(b.name),
  };
  items.sort(sorters[sort] || ((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name)));
  res.json(items);
});

router.post("/samples", auth, requireRole("admin"), async (req, res) => {
  if (await Material.exists({ sample: true })) throw httpError(409, "The sample materials are already loaded.");
  const created = await Material.insertMany(sampleMaterials.map((s) => ({ ...s, createdBy: req.user.id })));
  res.status(201).json({ added: created.length });
});

router.get("/:id", auth, async (req, res) => {
  const material = await Material.findById(req.params.id).lean();
  if (!material) throw httpError(404, "Material not found.");
  res.json(material);
});

// Does this material suit the chosen design? Optional size and quantity mimic a component.
router.get("/:id/fit", auth, async (req, res) => {
  const { designId, size, quantity } = req.query;
  if (!mongoose.isValidObjectId(designId)) throw httpError(400, "Choose a design to check against.");
  const [material, design] = await Promise.all([Material.findById(req.params.id).lean(), Design.findById(designId).lean()]);
  if (!material) throw httpError(404, "Material not found.");
  if (!design) throw httpError(404, "Design not found.");
  res.json(checkFit(material, design, { size, quantity: Number(quantity) || undefined }));
});

router.post("/", auth, manage, async (req, res) => {
  const material = await Material.create({ ...cleanMaterial(req.body), createdBy: req.user.id });
  res.status(201).json(material);
});

router.put("/:id", auth, manage, async (req, res) => {
  const material = await Material.findByIdAndUpdate(req.params.id, cleanMaterial(req.body), { returnDocument: "after", runValidators: true });
  if (!material) throw httpError(404, "Material not found.");
  res.json(material);
});

router.delete("/:id", auth, manage, async (req, res) => {
  const material = await Material.findByIdAndDelete(req.params.id);
  if (!material) throw httpError(404, "Material not found.");
  await removeMedia(material.images);
  res.json({ ok: true });
});

router.post("/:id/images", auth, manage, imageUpload.array("images", 6), async (req, res) => {
  const files = await accept(req.files);
  if (!files.length) throw httpError(400, "Choose at least one image.");
  const material = await Material.findById(req.params.id);
  if (!material) {
    await removeMedia(files);
    throw httpError(404, "Material not found.");
  }
  material.images.push(...files.map(({ url, name }) => ({ url, name })));
  await material.save();
  res.status(201).json(material);
});

router.delete("/:id/images/:imageId", auth, manage, async (req, res) => {
  const material = await Material.findById(req.params.id);
  const image = material?.images.id(req.params.imageId);
  if (!image) throw httpError(404, "Image not found.");
  await removeMedia([image]);
  image.deleteOne();
  await material.save();
  res.json(material);
});

export default router;

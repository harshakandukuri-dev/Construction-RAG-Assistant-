import { Router } from "express";
import Project from "../models/Project.js";
import { auth, requireRole } from "../middleware/auth.js";

const router = Router();
router.get("/", auth, async (req, res) => res.json(await Project.find().sort("-createdAt")));
router.post("/", auth, requireRole("admin", "engineer"), async (req, res) => {
  const p = await Project.create({ ...req.body, createdBy: req.user.id });
  res.status(201).json(p);
});
export default router;
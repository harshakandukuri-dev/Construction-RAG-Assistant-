import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";
import User from "../models/User.js";
import { auth } from "../middleware/auth.js";
import { httpError } from "../lib/http.js";

const router = Router();

// Slows down password guessing without getting in the way of normal use.
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many attempts. Try again in a few minutes." },
});

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const session = (user) => ({
  token: jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: "1d" }),
  role: user.role,
  name: user.name,
  email: user.email,
});

router.post("/register", limiter, async (req, res) => {
  const { name = "", email = "", password = "" } = req.body ?? {};
  if (!EMAIL.test(email)) throw httpError(400, "Enter a valid email address.");
  if (typeof password !== "string" || password.length < 8)
    throw httpError(400, "Use a password with at least 8 characters.");
  if (await User.exists({ email: email.toLowerCase().trim() }))
    throw httpError(409, "An account with that email already exists.");

  // The first account becomes the administrator so the app is usable straight away.
  const role = (await User.estimatedDocumentCount()) === 0 ? "admin" : "user";
  const user = await User.create({
    name: String(name).trim() || email.split("@")[0],
    email,
    password: await bcrypt.hash(password, 10),
    role,
  });
  res.status(201).json(session(user));
});

router.post("/login", limiter, async (req, res) => {
  const { email = "", password = "" } = req.body ?? {};
  const user = await User.findOne({ email: String(email).toLowerCase().trim() });
  if (!user || !(await bcrypt.compare(String(password), user.password)))
    throw httpError(401, "Email or password is incorrect.");
  res.json(session(user));
});

router.get("/me", auth, async (req, res) => {
  const user = await User.findById(req.user.id).select("name email role");
  if (!user) throw httpError(401, "Sign in to continue.");
  res.json({ name: user.name, email: user.email, role: user.role });
});

export default router;

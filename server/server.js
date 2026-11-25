import "dotenv/config";
import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import fs from "node:fs";
import path from "node:path";
import authRoutes from "./routes/auth.js";
import projectRoutes from "./routes/projects.js";
import documentRoutes from "./routes/documents.js";
import chatRoutes from "./routes/chat.js";
import materialRoutes from "./routes/materials.js";
import designRoutes from "./routes/designs.js";
import { MEDIA_DIR } from "./lib/media.js";
import { ragHealth } from "./lib/rag.js";
import { notFound, errorHandler } from "./middleware/error.js";

const missing = ["MONGO_URI", "JWT_SECRET"].filter((key) => !process.env[key]);
if (missing.length) {
  console.error(`Missing ${missing.join(" and ")} in server/.env. Copy .env.example to .env and fill it in.`);
  process.exit(1);
}

const PORT = process.env.PORT || 5000;
fs.mkdirSync(path.resolve(process.env.UPLOAD_DIR || "uploads"), { recursive: true });
fs.mkdirSync(MEDIA_DIR, { recursive: true });

const app = express();
app.use(
  cors({
    origin: (process.env.CLIENT_ORIGIN || "http://localhost:3000,http://127.0.0.1:3000").split(","),
    exposedHeaders: ["Content-Disposition"],
  })
);
app.use(express.json({ limit: "100kb" }));

app.get("/api/health", async (req, res) => {
  res.json({ api: true, rag: await ragHealth() });
});
app.use("/api/auth", authRoutes);
app.use("/api/projects", projectRoutes);
app.use("/api/documents", documentRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/materials", materialRoutes);
app.use("/api/designs", designRoutes);
// Photos and drawings. File names are random, and only this folder is served.
app.use(
  "/files",
  express.static(MEDIA_DIR, {
    maxAge: "7d",
    immutable: true,
    setHeaders: (res) => res.setHeader("X-Content-Type-Options", "nosniff"),
  })
);
app.use(notFound);
app.use(errorHandler);

try {
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 8000 });
} catch (err) {
  console.error(`Could not connect to MongoDB (${err.message}). Is it running, and is MONGO_URI correct?`);
  process.exit(1);
}
console.log("MongoDB connected");
app.listen(PORT, () => console.log(`API listening on http://localhost:${PORT}`));

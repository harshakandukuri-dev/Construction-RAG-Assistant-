import "dotenv/config";
import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import authRoutes from "./routes/auth.js";
import projectRoutes from "./routes/projects.js";
import documentRoutes from "./routes/documents.js";
import chatRoutes from "./routes/chat.js";

const app = express();
app.use(cors({ origin: "http://localhost:3000" }));
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/projects", projectRoutes);
app.use("/api/documents", documentRoutes);
app.use("/api/chat", chatRoutes);

await mongoose.connect(process.env.MONGO_URI);
console.log("MongoDB connected");
app.listen(process.env.PORT, () => console.log(`API on ${process.env.PORT}`));
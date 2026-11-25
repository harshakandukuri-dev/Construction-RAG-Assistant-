import mongoose from "mongoose";

export const DOMAINS = ["interior", "exterior", "structural", "general"];

const schema = new mongoose.Schema(
  {
    project: { type: mongoose.Schema.Types.ObjectId, ref: "Project", required: true, index: true },
    title: String,
    filePath: String,
    size: Number,
    domain: { type: String, enum: DOMAINS, default: "general" },
    pages: Number,
    chunks: Number,
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

export default mongoose.model("Document", schema);

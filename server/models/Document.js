import mongoose from "mongoose";
const schema = new mongoose.Schema({
  project: { type: mongoose.Schema.Types.ObjectId, ref: "Project", required: true },
  title: String,
  filePath: String,
  domain: { type: String, enum: ["interior", "exterior", "structural", "general"], default: "general" },
  pages: Number,
  chunks: Number,
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
}, { timestamps: true });
export default mongoose.model("Document", schema);
import mongoose from "mongoose";
import { QUALITY } from "./Material.js";

const file = new mongoose.Schema(
  { url: String, name: String, kind: { type: String, enum: ["image", "pdf"], default: "image" } },
  { _id: true }
);

const component = new mongoose.Schema({
  material: { type: mongoose.Schema.Types.ObjectId, ref: "Material" },
  size: String,
  quantity: Number, // empty means "use the design's area" for area-based materials
  note: String,
});

const schema = new mongoose.Schema(
  {
    project: { type: mongoose.Schema.Types.ObjectId, ref: "Project", required: true, index: true },
    name: { type: String, required: true, trim: true },
    space: String, // for example "Living room" or "Front facade"
    domain: { type: String, enum: ["interior", "exterior"], required: true },
    style: String,
    area: Number, // square feet
    dimensions: String, // for example "18 x 14 ft, 10 ft ceiling"
    budget: Number, // rupees
    qualityTarget: { type: String, enum: QUALITY, default: "standard" },
    wetArea: { type: Boolean, default: false },
    highTraffic: { type: Boolean, default: false },
    notes: String,
    blueprints: [file],
    references: [file],
    components: [component],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

export default mongoose.model("Design", schema);

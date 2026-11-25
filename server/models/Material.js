import mongoose from "mongoose";

export const CATEGORIES = [
  "Flooring", "Wall finish", "Paint", "Ceiling", "Lighting", "Joinery & furniture", "Countertop",
  "Sanitary & fittings", "Doors & windows", "Facade cladding", "Roofing", "Waterproofing",
  "Paving & landscape", "Structural", "Other",
];
export const DOMAINS = ["interior", "exterior", "both"];
export const QUALITY = ["economy", "standard", "premium", "luxury"];
export const STYLES = ["modern", "contemporary", "minimalist", "classic", "traditional", "industrial", "rustic", "scandinavian"];
export const UNITS = ["sq ft", "sq m", "running ft", "piece", "litre", "kg", "bag", "roll", "set"];

const image = new mongoose.Schema({ url: String, name: String }, { _id: true });

const schema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    category: { type: String, enum: CATEGORIES, required: true, index: true },
    domain: { type: String, enum: DOMAINS, default: "both" },
    brand: String,
    model: String,
    styles: [String],
    sizes: [String],
    unit: { type: String, enum: UNITS, default: "sq ft" },
    priceMin: { type: Number, required: true, min: 0 },
    priceMax: { type: Number, required: true, min: 0 },
    quality: { type: String, enum: QUALITY, default: "standard" },
    // 1 (poor) to 5 (excellent)
    durability: { type: Number, min: 1, max: 5, default: 3 },
    waterResistance: { type: Number, min: 1, max: 5, default: 3 },
    weatherResistance: { type: Number, min: 1, max: 5, default: 3 },
    easeOfUpkeep: { type: Number, min: 1, max: 5, default: 3 },
    lifespanYears: Number,
    about: String,
    pros: [String],
    cons: [String],
    bestFor: [String],
    notFor: [String],
    swatch: { type: String, default: "#d2d2d7" },
    images: [image],
    sample: { type: Boolean, default: false },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

export default mongoose.model("Material", schema);

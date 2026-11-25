import { httpError } from "./http.js";
import { CATEGORIES, DOMAINS, QUALITY, STYLES, UNITS } from "../models/Material.js";

const text = (value, max = 200) => String(value ?? "").trim().slice(0, max);
const oneOf = (value, allowed, label, fallback) => {
  if (value === undefined || value === "") {
    if (fallback !== undefined) return fallback;
    throw httpError(400, `Choose a ${label}.`);
  }
  if (!allowed.includes(value)) throw httpError(400, `"${value}" isn't a valid ${label}.`);
  return value;
};
const split = (value, pattern, max, length) =>
  (Array.isArray(value) ? value : String(value ?? "").split(pattern))
    .map((s) => text(s, length))
    .filter(Boolean)
    .slice(0, max);
const commaList = (value, max = 12) => split(value, /[\n,]/, max, 60);
const lines = (value, max = 8) => split(value, /\n/, max, 160);

function number(value, label, { min = 0, max = 1e9, required = false, integer = false } = {}) {
  if (value === undefined || value === null || value === "") {
    if (required) throw httpError(400, `Enter ${label}.`);
    return undefined;
  }
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) throw httpError(400, `${label} must be a number between ${min} and ${max}.`);
  return integer ? Math.round(n) : n;
}
const rating = (value, label) => number(value ?? 3, label, { min: 1, max: 5, integer: true });

export function cleanMaterial(body = {}) {
  const name = text(body.name, 120);
  if (!name) throw httpError(400, "Give the material a name.");
  const priceMin = number(body.priceMin, "The lowest price", { required: true });
  const priceMax = number(body.priceMax ?? body.priceMin, "The highest price", { required: true });
  if (priceMin > priceMax) throw httpError(400, "The lowest price can't be higher than the highest price.");
  const swatch = /^#[0-9a-f]{6}$/i.test(body.swatch || "") ? body.swatch : "#d2d2d7";

  return {
    name,
    category: oneOf(body.category, CATEGORIES, "category"),
    domain: oneOf(body.domain, DOMAINS, "setting", "both"),
    brand: text(body.brand, 80),
    model: text(body.model, 80),
    styles: commaList(body.styles).filter((s) => STYLES.includes(s.toLowerCase())).map((s) => s.toLowerCase()),
    sizes: commaList(body.sizes),
    unit: oneOf(body.unit, UNITS, "unit", "sq ft"),
    priceMin,
    priceMax,
    quality: oneOf(body.quality, QUALITY, "quality", "standard"),
    durability: rating(body.durability, "Durability"),
    waterResistance: rating(body.waterResistance, "Water resistance"),
    weatherResistance: rating(body.weatherResistance, "Weather resistance"),
    easeOfUpkeep: rating(body.easeOfUpkeep, "Ease of upkeep"),
    lifespanYears: number(body.lifespanYears, "Lifespan", { min: 1, max: 200, integer: true }),
    about: text(body.about, 1200),
    pros: lines(body.pros),
    cons: lines(body.cons),
    bestFor: lines(body.bestFor),
    notFor: lines(body.notFor),
    swatch,
  };
}

export function cleanDesign(body = {}) {
  const name = text(body.name, 120);
  if (!name) throw httpError(400, "Give the design a name.");
  const style = text(body.style, 40).toLowerCase();
  if (style && !STYLES.includes(style)) throw httpError(400, `"${style}" isn't a known style.`);
  return {
    name,
    space: text(body.space, 80),
    domain: oneOf(body.domain, ["interior", "exterior"], "setting (interior or exterior)"),
    style,
    area: number(body.area, "The area", { min: 1, max: 1e7 }),
    dimensions: text(body.dimensions, 120),
    budget: number(body.budget, "The budget", { min: 0 }),
    qualityTarget: oneOf(body.qualityTarget, QUALITY, "quality target", "standard"),
    wetArea: Boolean(body.wetArea),
    highTraffic: Boolean(body.highTraffic),
    notes: text(body.notes, 1500),
  };
}

export function cleanComponent(body = {}) {
  return {
    size: text(body.size, 60),
    quantity: number(body.quantity, "The quantity", { min: 0.01, max: 1e7 }),
    note: text(body.note, 200),
  };
}

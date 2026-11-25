// Decides whether a material suits a design and prices a line of materials.
// Pure functions with no database access, so they are easy to test.

import { QUALITY } from "../models/Material.js";

const SQ_M_TO_SQ_FT = 10.7639;
const round = (n) => Math.round(n);
const label = (s) => s.charAt(0).toUpperCase() + s.slice(1);
export const inr = (n) => `₹${Math.round(n).toLocaleString("en-IN")}`;

// How much of the material the design needs. Uses the quantity entered on the
// component, otherwise the design's area for area-based units.
export function quantityFor(material, design, component) {
  if (component?.quantity > 0) return component.quantity;
  if (!design?.area) return null;
  if (material.unit === "sq ft") return design.area;
  if (material.unit === "sq m") return design.area / SQ_M_TO_SQ_FT;
  return null;
}

export function lineCost(material, quantity) {
  if (!quantity) return null;
  return { min: round(material.priceMin * quantity), max: round(material.priceMax * quantity) };
}

export function checkFit(material, design, component = {}) {
  const checks = [];
  const add = (id, status, title, detail) => checks.push({ id, status, title, detail });

  // Interior or exterior
  if (material.domain === "both" || material.domain === design.domain) {
    add("domain", "pass", "Right setting", `Suitable for ${design.domain} use.`);
  } else {
    add("domain", "fail", "Wrong setting", `Made for ${material.domain} use, but this design is ${design.domain}.`);
  }

  // Style
  if (design.style) {
    if (!material.styles?.length) {
      add("style", "warn", "Style not listed", `No styles are listed for this material, so ${design.style} can't be confirmed.`);
    } else if (material.styles.includes(design.style)) {
      add("style", "pass", "Matches the style", `Works with a ${design.style} look.`);
    } else {
      add("style", "warn", "Different style", `Usually chosen for ${material.styles.join(", ")}, not ${design.style}.`);
    }
  }

  // Quality against the target
  if (design.qualityTarget) {
    const diff = QUALITY.indexOf(material.quality) - QUALITY.indexOf(design.qualityTarget);
    if (diff === 0) add("quality", "pass", "Meets the quality target", `${label(material.quality)} grade, as planned.`);
    else if (diff > 0) add("quality", "pass", "Above the quality target", `${label(material.quality)} grade is higher than the ${design.qualityTarget} target, so it may cost more.`);
    else add("quality", "warn", "Below the quality target", `${label(material.quality)} grade is under the ${design.qualityTarget} target.`);
  }

  // Wet areas, outdoor weather and heavy use
  const level = (value, good, what, subject) => {
    if (value >= 4) return ["pass", `Good ${what}`, `Rated ${value} out of 5 for ${what}.`];
    if (value === 3) return ["warn", `Average ${what}`, `Rated ${value} out of 5 for ${what}. ${subject}`];
    return ["fail", `Weak ${what}`, `Rated ${value} out of 5 for ${what}. ${subject}`];
  };
  if (design.wetArea) {
    add("water", ...level(material.waterResistance, 4, "water resistance", "This space gets wet, so check the finish or add protection."));
  }
  if (design.domain === "exterior") {
    add("weather", ...level(material.weatherResistance, 4, "weather resistance", "Sun and rain will wear it faster."));
  }
  if (design.highTraffic) {
    add("wear", ...level(material.durability, 4, "durability", "Heavy foot traffic will show wear sooner."));
  }

  // Size
  if (component.size && material.sizes?.length) {
    if (material.sizes.includes(component.size)) add("size", "pass", "Size available", `${component.size} is offered.`);
    else add("size", "warn", "Size not listed", `${component.size} isn't listed. Available: ${material.sizes.join(", ")}.`);
  }

  // Budget
  const cost = lineCost(material, quantityFor(material, design, component));
  if (design.budget && cost) {
    const share = Math.round((cost.max / design.budget) * 100);
    if (cost.min > design.budget) add("budget", "fail", "Over budget", `Costs ${inr(cost.min)} to ${inr(cost.max)}, above the ${inr(design.budget)} budget even at the lowest price.`);
    else if (cost.max > design.budget) add("budget", "warn", "Could go over budget", `Costs ${inr(cost.min)} to ${inr(cost.max)}. The upper end passes the ${inr(design.budget)} budget.`);
    else add("budget", "pass", "Within budget", `Costs ${inr(cost.min)} to ${inr(cost.max)}, at most ${share}% of the budget.`);
  }

  const failed = checks.some((c) => c.status === "fail");
  const warned = checks.some((c) => c.status === "warn");
  const points = checks.reduce((sum, c) => sum + (c.status === "pass" ? 1 : c.status === "warn" ? 0.5 : 0), 0);
  return {
    verdict: failed ? "not-suitable" : warned ? "partly" : "fits",
    score: checks.length ? Math.round((points / checks.length) * 100) : 100,
    cost,
    checks,
  };
}

export function designTotals(components, budget) {
  let min = 0;
  let max = 0;
  const byCategory = new Map();
  for (const c of components) {
    if (!c.cost) continue;
    min += c.cost.min;
    max += c.cost.max;
    const row = byCategory.get(c.material.category) || { category: c.material.category, min: 0, max: 0 };
    row.min += c.cost.min;
    row.max += c.cost.max;
    byCategory.set(c.material.category, row);
  }
  let budgetStatus = null;
  if (budget) budgetStatus = min > budget ? "over" : max > budget ? "near" : "within";
  return { min, max, budgetStatus, byCategory: [...byCategory.values()].sort((a, b) => b.max - a.max) };
}

// Turns a priced design into plain-language explanations. Everything is built from
// the design's own data (materials, prices, fit checks), so nothing is invented.

import { inr } from "./fit.js";

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : "");
const plural = (n, word) => `${n} ${n === 1 ? word : word.endsWith("y") ? `${word.slice(0, -1)}ies` : `${word}s`}`;
const list = (items) =>
  items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
const sqft = (n) => `${Number(n).toLocaleString("en-IN")} sq ft`;
const money = (cost) => (cost.min === cost.max ? inr(cost.min) : `${inr(cost.min)} to ${inr(cost.max)}`);

export const VERDICT_TEXT = {
  fits: "Fits your design",
  partly: "Fits with a few notes",
  "not-suitable": "Not a good match",
};

// Groups of categories a finished space normally needs. Used only to point out what hasn't been chosen yet.
const CORE = {
  interior: [
    ["Flooring", ["Flooring"]],
    ["Wall finish or paint", ["Wall finish", "Paint"]],
    ["Ceiling", ["Ceiling"]],
    ["Lighting", ["Lighting"]],
  ],
  exterior: [
    ["Facade cladding or paint", ["Facade cladding", "Paint"]],
    ["Roofing", ["Roofing"]],
    ["Waterproofing", ["Waterproofing"]],
    ["Doors and windows", ["Doors & windows"]],
  ],
};

export function explainDesign(design) {
  const lines = design.components.filter((c) => c.material);
  const totals = design.totals;

  // ---- overview
  const overview = [];
  const look = [design.style, design.domain].filter(Boolean).join(" ");
  const bits = [
    design.area && `covers ${sqft(design.area)}${design.dimensions ? ` (${design.dimensions})` : ""}`,
    design.budget && `has a budget of ${inr(design.budget)}`,
    design.qualityTarget && `aims for ${design.qualityTarget} quality`,
  ].filter(Boolean);
  let first = `${design.name} is a ${look} design${design.space ? ` for the ${design.space.toLowerCase()}` : ""}.`;
  if (bits.length) first += ` It ${list(bits)}.`;
  if (design.wetArea) first += " It is a wet area, so water resistance matters most.";
  if (design.highTraffic) first += " It sees heavy foot traffic, so durability matters.";
  overview.push(first);

  const chosenCategories = [...new Set(lines.map((c) => c.material.category))];
  if (!lines.length) {
    overview.push("No materials have been chosen yet. Add materials to see their prices and whether they suit this design.");
  } else {
    overview.push(
      `${plural(lines.length, "material")} ${lines.length === 1 ? "has" : "have"} been chosen across ${plural(chosenCategories.length, "category")}: ${list(chosenCategories.map((c) => c.toLowerCase()))}.`
    );
  }

  const priced = lines.filter((c) => c.cost);
  if (priced.length) {
    let cost = `Together they are estimated at ${inr(totals.min)} to ${inr(totals.max)}. The lower figure uses the lowest price in each material's range and the higher figure uses the highest.`;
    if (design.budget) {
      if (totals.budgetStatus === "within") cost += ` Even the higher figure is within the ${inr(design.budget)} budget.`;
      else if (totals.budgetStatus === "near") cost += ` The lower figure is within the ${inr(design.budget)} budget, but the higher figure goes over it by up to ${inr(totals.max - design.budget)}.`;
      else cost += ` Even the lower figure is ${inr(totals.min - design.budget)} above the ${inr(design.budget)} budget.`;
    } else {
      cost += " No budget has been set, so the estimate can't be compared against one.";
    }
    overview.push(cost);
  }
  const unpriced = lines.filter((c) => !c.cost);
  if (unpriced.length) {
    overview.push(`${plural(unpriced.length, "item")} (${list(unpriced.map((c) => c.material.name))}) ${unpriced.length === 1 ? "has" : "have"} no cost yet because no quantity was entered. The total will rise once ${unpriced.length === 1 ? "it is" : "they are"} included.`);
  }

  if (lines.length) {
    const count = (v) => lines.filter((c) => c.fit.verdict === v).length;
    const parts = [
      count("fits") && `${count("fits")} fit${count("fits") === 1 ? "s" : ""} the design well`,
      count("partly") && `${count("partly")} ${count("partly") === 1 ? "fits" : "fit"} with a few notes`,
      count("not-suitable") && `${count("not-suitable")} ${count("not-suitable") === 1 ? "is" : "are"} not a good match`,
    ].filter(Boolean);
    let fit = `Of the materials chosen, ${list(parts)}.`;
    if (design.style) {
      const styled = lines.filter((c) => c.material.styles?.includes(design.style)).length;
      fit += ` ${plural(styled, "material")} ${styled === 1 ? "is" : "are"} usually chosen for the ${design.style} style.`;
    }
    overview.push(fit);
  }

  // ---- things that need attention
  const attention = [];
  for (const c of lines) {
    for (const check of c.fit.checks) {
      if (check.status !== "pass") {
        attention.push({ level: check.status, material: c.material.name, title: check.title, text: check.detail });
      }
    }
  }
  attention.sort((a, b) => (a.level === b.level ? 0 : a.level === "fail" ? -1 : 1));

  // ---- each material
  const materials = lines.map((c) => {
    const m = c.material;
    const summary = [];
    const size = c.size ? `size ${c.size}` : "any size";
    const amount = c.qty ? (c.autoQuantity ? `${Math.round(c.qty * 10) / 10} ${m.unit} (the design's area)` : `${c.qty} ${m.unit}`) : `no quantity entered`;
    summary.push(`${m.name} is a ${m.quality} grade ${m.category.toLowerCase()} material${m.domain === "both" ? " for interior and exterior use" : ` for ${m.domain} use`}. This design uses ${size}, ${amount}.`);
    summary.push(
      c.cost
        ? `It is priced at ${money({ min: m.priceMin, max: m.priceMax })} per ${m.unit}, so this line costs about ${money(c.cost)}.`
        : `It is priced at ${money({ min: m.priceMin, max: m.priceMax })} per ${m.unit}. Enter a quantity to see the cost of this line.`
    );
    if (m.lifespanYears) summary.push(`It is expected to last about ${m.lifespanYears} years with normal care.`);
    return {
      componentId: String(c._id),
      name: m.name,
      verdict: c.fit.verdict,
      verdictText: VERDICT_TEXT[c.fit.verdict],
      summary,
      why: c.fit.checks.filter((k) => k.status === "pass").map((k) => `${k.title}. ${k.detail}`),
      watch: c.fit.checks.filter((k) => k.status !== "pass").map((k) => `${k.title}. ${k.detail}`),
    };
  });

  // ---- what hasn't been chosen
  const groups = CORE[design.domain] || [];
  const missing = groups.filter(([, cats]) => !cats.some((cat) => chosenCategories.includes(cat))).map(([label]) => label);

  // ---- next steps
  const nextSteps = [];
  if (lines.some((c) => c.fit.verdict === "not-suitable")) nextSteps.push("Replace or review the materials marked \"Not a good match\".");
  if (totals.budgetStatus === "over" || totals.budgetStatus === "near") nextSteps.push("Bring the estimate inside the budget by reducing quantities or choosing lower-priced materials.");
  if (unpriced.length) nextSteps.push("Enter quantities for the items that have no cost yet.");
  if (missing.length) nextSteps.push(`Decide on ${list(missing.map((m) => m.toLowerCase()))}, which are not in this design yet. Skip any that are outside the scope.`);
  nextSteps.push("Confirm prices with supplier quotes and measure the site before ordering.");
  nextSteps.push(design.blueprints?.length ? "Ask your engineer to check the blueprint against these material choices." : "Upload a blueprint so everyone works from the same drawing.");

  const notes = [];
  if (lines.some((c) => c.material.sample)) notes.push("Some prices come from sample data and are only indicative. Replace them with supplier quotes.");
  notes.push("Costs are estimates from price ranges. They do not include labour, transport, wastage or taxes unless your supplier prices do.");

  return {
    headline: lines.length
      ? `${plural(lines.length, "material")}, ${priced.length ? `about ${inr(totals.min)} to ${inr(totals.max)}` : "not priced yet"}`
      : "No materials chosen yet",
    overview,
    attention,
    materials,
    missing,
    nextSteps,
    notes,
  };
}

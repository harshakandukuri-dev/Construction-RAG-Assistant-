import test from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import { explainDesign } from "../lib/explain.js";
import { buildDesignPdf } from "../lib/pdf.js";
import { checkFit, quantityFor, lineCost, designTotals } from "../lib/fit.js";

const mat = (o) => ({
  _id: o.name, category: "Flooring", domain: "interior", styles: ["modern"], sizes: [], unit: "sq ft", priceMin: 45, priceMax: 110,
  quality: "standard", durability: 4, waterResistance: 4, weatherResistance: 2, easeOfUpkeep: 4, ...o,
});

// Builds the same shape the API produces for a design.
function present(base, rows) {
  const design = { name: "Living room", space: "Ground floor", domain: "interior", style: "modern", area: 200, budget: 60000, qualityTarget: "standard", blueprints: [], references: [], ...base };
  design.components = rows.map(([material, c = {}], i) => {
    const qty = quantityFor(material, design, c);
    return { _id: `c${i}`, ...c, material, qty, autoQuantity: !(c.quantity > 0), cost: lineCost(material, qty), fit: checkFit(material, design, c) };
  });
  design.totals = designTotals(design.components, design.budget);
  design.explanation = explainDesign(design);
  return design;
}

const tile = mat({ name: "Vitrified tile" });
const marble = mat({ name: "Italian marble", priceMin: 300, priceMax: 1200, quality: "luxury", styles: ["classic"] });
const led = mat({ name: "LED panel", category: "Lighting", unit: "piece", priceMin: 900, priceMax: 2800 });

test("overview describes the design, the choices and the cost", () => {
  const d = present({}, [[tile], [mat({ name: "Paint", category: "Paint", unit: "litre", priceMin: 300, priceMax: 600 }), { quantity: 20 }]]);
  const text = d.explanation.overview.join(" ");
  assert.match(text, /Living room is a modern interior design for the ground floor/);
  assert.match(text, /covers 200 sq ft/);
  assert.match(text, /budget of ₹60,000/);
  assert.match(text, /2 materials have been chosen across 2 categories: flooring and paint/);
  assert.match(text, /estimated at ₹15,000 to ₹34,000/);
  assert.match(text, /within the ₹60,000 budget/);
  assert.equal(d.explanation.materials.length, 2);
});

test("budget wording covers within, over the top, over entirely and no budget", () => {
  assert.match(present({ budget: 30000 }, [[tile]]).explanation.overview.join(" "), /within the ₹30,000 budget/);
  assert.match(present({ budget: 15000 }, [[tile]]).explanation.overview.join(" "), /goes over it by up to ₹7,000/);
  assert.match(present({ budget: 5000 }, [[tile]]).explanation.overview.join(" "), /lower figure is ₹4,000 above the ₹5,000 budget/);
  assert.match(present({ budget: undefined }, [[tile]]).explanation.overview.join(" "), /No budget has been set/);
});

test("items without a quantity are called out in the right grammar", () => {
  assert.match(present({}, [[tile], [led]]).explanation.overview.join(" "), /1 item \(LED panel\) has no cost yet.*once it is included/);
  const two = present({}, [[led], [mat({ ...led, name: "Spot light" })]]).explanation.overview.join(" ");
  assert.match(two, /2 items \(LED panel and Spot light\) have no cost yet.*once they are included/);
});

test("problems are listed with the worst first", () => {
  const d = present({ budget: 20000 }, [[tile], [marble]]);
  const levels = d.explanation.attention.map((a) => a.level);
  assert.ok(levels.length >= 2);
  assert.deepEqual(levels, [...levels].sort((a, b) => (a === b ? 0 : a === "fail" ? -1 : 1)));
  assert.ok(d.explanation.attention.some((a) => a.material === "Italian marble" && a.level === "fail"));
  assert.ok(d.explanation.nextSteps.some((s) => /Not a good match/.test(s)));
  assert.ok(d.explanation.nextSteps.some((s) => /inside the budget/.test(s)));
});

test("each material gets a plain explanation with its price and line cost", () => {
  const [m] = present({}, [[tile, { size: "600x600 mm" }]]).explanation.materials;
  assert.equal(m.verdictText, "Fits your design");
  assert.match(m.summary.join(" "), /size 600x600 mm, 200 sq ft \(the design's area\)/);
  assert.match(m.summary.join(" "), /priced at ₹45 to ₹110 per sq ft, so this line costs about ₹9,000 to ₹22,000/);
  assert.ok(m.why.length > 0 && m.watch.length === 0);
});

test("an empty design says so and asks for a blueprint", () => {
  const d = present({ budget: undefined, style: undefined }, []);
  assert.match(d.explanation.overview.join(" "), /No materials have been chosen yet/);
  assert.equal(d.explanation.headline, "No materials chosen yet");
  assert.ok(d.explanation.nextSteps.some((s) => /Upload a blueprint/.test(s)));
  assert.deepEqual(d.explanation.missing, ["Flooring", "Wall finish or paint", "Ceiling", "Lighting"]);
});

test("categories not chosen yet are named, and sample prices are flagged", () => {
  const d = present({}, [[{ ...tile, sample: true }]]);
  assert.deepEqual(d.explanation.missing, ["Wall finish or paint", "Ceiling", "Lighting"]);
  assert.ok(d.explanation.notes.some((n) => /sample data/.test(n)));
  assert.equal(present({ domain: "exterior" }, []).explanation.missing.length, 4);
});

test("the PDF is built for a full design and for an empty one", async () => {
  for (const design of [present({}, [[tile], [marble], [led, { quantity: 8 }]]), present({}, [])]) {
    const pdf = await buildDesignPdf({ design, project: { name: "Harbour Villa" }, preparedBy: "Riya" });
    assert.equal(pdf.subarray(0, 4).toString(), "%PDF");
    const pages = (await PDFDocument.load(pdf)).getPageCount();
    assert.ok(pages >= (design.components.length ? 6 : 3), `unexpected page count ${pages}`);
  }
});

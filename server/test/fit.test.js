import test from "node:test";
import assert from "node:assert/strict";
import { checkFit, quantityFor, lineCost, designTotals } from "../lib/fit.js";
import { cleanMaterial, cleanDesign } from "../lib/clean.js";

const tile = {
  name: "Vitrified tile", category: "Flooring", domain: "interior", styles: ["modern"], sizes: ["600x600 mm"],
  unit: "sq ft", priceMin: 45, priceMax: 110, quality: "standard", durability: 4, waterResistance: 4, weatherResistance: 2,
};
const livingRoom = { domain: "interior", style: "modern", area: 200, budget: 50000, qualityTarget: "standard" };
const status = (result, id) => result.checks.find((c) => c.id === id)?.status;

test("a suitable material fits and is priced from the design's area", () => {
  const result = checkFit(tile, livingRoom);
  assert.equal(result.verdict, "fits");
  assert.deepEqual(result.cost, { min: 9000, max: 22000 });
  assert.equal(status(result, "budget"), "pass");
});

test("an interior material is not suitable for an exterior design", () => {
  const result = checkFit(tile, { ...livingRoom, domain: "exterior" });
  assert.equal(result.verdict, "not-suitable");
  assert.equal(status(result, "domain"), "fail");
  assert.equal(status(result, "weather"), "fail"); // weather resistance 2
});

test("a different style or lower quality gives notes, not a failure", () => {
  const result = checkFit(tile, { ...livingRoom, style: "classic", qualityTarget: "premium" });
  assert.equal(result.verdict, "partly");
  assert.equal(status(result, "style"), "warn");
  assert.equal(status(result, "quality"), "warn");
});

test("a higher grade than the target is allowed", () => {
  const result = checkFit({ ...tile, quality: "luxury" }, livingRoom);
  assert.equal(status(result, "quality"), "pass");
});

test("wet areas and heavy traffic use the matching ratings", () => {
  const wet = checkFit({ ...tile, waterResistance: 2 }, { ...livingRoom, wetArea: true });
  assert.equal(status(wet, "water"), "fail");
  const busy = checkFit({ ...tile, durability: 3 }, { ...livingRoom, highTraffic: true });
  assert.equal(status(busy, "wear"), "warn");
  assert.equal(status(checkFit(tile, livingRoom), "water"), undefined); // not asked, so not checked
});

test("budget: pass, warn when only the top end is over, fail when even the lowest price is over", () => {
  assert.equal(status(checkFit(tile, { ...livingRoom, budget: 30000 }), "budget"), "pass");
  assert.equal(status(checkFit(tile, { ...livingRoom, budget: 15000 }), "budget"), "warn");
  const over = checkFit(tile, { ...livingRoom, budget: 5000 });
  assert.equal(status(over, "budget"), "fail");
  assert.equal(over.verdict, "not-suitable");
});

test("size is checked only when a size is chosen", () => {
  assert.equal(status(checkFit(tile, livingRoom, { size: "600x600 mm" }), "size"), "pass");
  assert.equal(status(checkFit(tile, livingRoom, { size: "900x900 mm" }), "size"), "warn");
  assert.equal(status(checkFit(tile, livingRoom), "size"), undefined);
});

test("quantity: entered value wins, sq m is converted, non-area units need a quantity", () => {
  assert.equal(quantityFor(tile, livingRoom, { quantity: 50 }), 50);
  assert.equal(quantityFor({ ...tile, unit: "sq m" }, { area: 107.639 }, {}).toFixed(1), "10.0");
  assert.equal(quantityFor({ ...tile, unit: "piece" }, livingRoom, {}), null);
  assert.equal(lineCost({ ...tile, unit: "piece" }, null), null);
  assert.equal(status(checkFit({ ...tile, unit: "piece" }, livingRoom), "budget"), undefined);
});

test("totals add up per category and report the budget position", () => {
  const rows = [
    { material: { category: "Flooring" }, cost: { min: 100, max: 200 } },
    { material: { category: "Flooring" }, cost: { min: 50, max: 80 } },
    { material: { category: "Paint" }, cost: { min: 10, max: 20 } },
    { material: { category: "Paint" }, cost: null },
  ];
  const totals = designTotals(rows, 250);
  assert.equal(totals.min, 160);
  assert.equal(totals.max, 300);
  assert.equal(totals.budgetStatus, "near");
  assert.deepEqual(totals.byCategory.map((r) => [r.category, r.max]), [["Flooring", 280], ["Paint", 20]]);
  assert.equal(designTotals(rows, 100).budgetStatus, "over");
  assert.equal(designTotals(rows, 1000).budgetStatus, "within");
  assert.equal(designTotals(rows, undefined).budgetStatus, null);
});

test("cleanMaterial validates and tidies input", () => {
  const ok = cleanMaterial({ name: " Tile ", category: "Flooring", priceMin: "10", priceMax: "20", styles: "Modern, nonsense", sizes: "600x600 mm,\n800x800 mm", pros: "Hard\nCheap", swatch: "#abcdef", durability: 5 });
  assert.equal(ok.name, "Tile");
  assert.deepEqual(ok.styles, ["modern"]);
  assert.deepEqual(ok.sizes, ["600x600 mm", "800x800 mm"]);
  assert.deepEqual(ok.pros, ["Hard", "Cheap"]);
  assert.equal(ok.domain, "both");
  assert.throws(() => cleanMaterial({ name: "x", category: "Flooring", priceMin: 30, priceMax: 20 }), /lowest price/);
  assert.throws(() => cleanMaterial({ name: "x", category: "Nope", priceMin: 1 }), /valid category/);
  assert.throws(() => cleanMaterial({ category: "Flooring", priceMin: 1 }), /name/);
  assert.throws(() => cleanMaterial({ name: "x", category: "Flooring", priceMin: -5 }), /between/);
  assert.throws(() => cleanMaterial({ name: "x", category: "Flooring", priceMin: 5, durability: 9 }), /Durability/);
});

test("cleanDesign needs a name and a setting", () => {
  assert.equal(cleanDesign({ name: "Lobby", domain: "interior", area: "250", budget: "100000" }).area, 250);
  assert.throws(() => cleanDesign({ name: "Lobby" }), /setting/);
  assert.throws(() => cleanDesign({ name: "Lobby", domain: "interior", style: "baroque" }), /style/);
});

import PDFDocument from "pdfkit";
import { PDFDocument as PdfLib } from "pdf-lib";
import sharp from "sharp";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MEDIA_DIR } from "./media.js";
import { inr } from "./fit.js";
import { VERDICT_TEXT } from "./explain.js";

const FONTS = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "assets", "fonts");
const W = 595.28;
const H = 841.89;
const M = 48;
const CW = W - M * 2;
const BOTTOM = H - 64;

const C = { ink: "#1d1d1f", gray: "#6e6e73", faint: "#86868b", line: "#d2d2d7", fill: "#f5f5f7", blue: "#0071e3", pass: "#248a3d", warn: "#b25000", fail: "#d70015" };
const TINT = { pass: "#e6f3ea", warn: "#fdeedd", fail: "#fbe5e8" };
const VERDICT_TONE = { fits: "pass", partly: "warn", "not-suitable": "fail" };
const STATUS_WORD = { pass: "Passed", warn: "Note", fail: "Problem" };
const BUDGET_TONE = { within: "pass", near: "warn", over: "fail" };

const range = (a, b) => (a === b ? inr(a) : `${inr(a)} to ${inr(b)}`);
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : "");

// ---------------------------------------------------------------- images

async function loadImage(url) {
  try {
    const file = path.join(MEDIA_DIR, path.basename(url || ""));
    const { data, info } = await sharp(file)
      .rotate()
      .resize({ width: 1800, height: 1800, fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 85 })
      .toBuffer({ resolveWithObject: true });
    return { data, width: info.width, height: info.height };
  } catch {
    return null; // missing or unreadable: the page shows a placeholder instead
  }
}

// ---------------------------------------------------------------- drawing helpers

const font = (doc, name, size, color = C.ink) => doc.font(name).fontSize(size).fillColor(color);
const room = (doc, need) => {
  if (doc.y + need > BOTTOM) doc.addPage();
};
const gap = (doc, n) => {
  doc.y += n;
};

function heading(doc, title, { size = 22, before = 0 } = {}) {
  gap(doc, before);
  room(doc, size + 50);
  font(doc, "Inter-Bold", size).text(title, M, doc.y, { width: CW });
  gap(doc, 10);
}

function paragraph(doc, str, { size = 11, color = C.ink, after = 8, x = M, width = CW, fontName = "Inter" } = {}) {
  font(doc, fontName, size, color);
  room(doc, doc.heightOfString(str, { width, lineGap: 3 }) + after);
  doc.text(str, x, doc.y, { width, lineGap: 3 });
  gap(doc, after);
}

function chip(doc, label, x, y, tone) {
  font(doc, "Inter-SemiBold", 9, C[tone]);
  const w = doc.widthOfString(label) + 18;
  doc.roundedRect(x, y, w, 19, 9.5).fill(TINT[tone]);
  font(doc, "Inter-SemiBold", 9, C[tone]).text(label, x + 9, y + 5, { lineBreak: false });
  return w;
}

function tile(doc, material, image, x, y, w, h) {
  doc.save();
  doc.roundedRect(x, y, w, h, 10).clip();
  if (image) doc.image(image.data, x, y, { cover: [w, h], align: "center", valign: "center" });
  else doc.rect(x, y, w, h).fill(material?.swatch || "#d2d2d7");
  doc.restore();
  doc.roundedRect(x, y, w, h, 10).lineWidth(0.6).strokeColor(C.line).stroke();
}

function meter(doc, label, value, x, y) {
  font(doc, "Inter", 9, C.gray).text(label, x, y, { lineBreak: false });
  for (let i = 0; i < 5; i++) {
    doc.roundedRect(x + 98 + i * 17, y + 2.5, 14, 5, 2.5).fill(i < value ? C.ink : "#e5e5ea");
  }
}

function bullets(doc, items, x, width, color = C.gray, size = 9.5) {
  for (const item of items) {
    font(doc, "Inter", size, color);
    doc.text(`•  ${item}`, x, doc.y, { width, lineGap: 2 });
    gap(doc, 2);
  }
}

// ---------------------------------------------------------------- sections

async function cover(doc, design, project, preparedBy, images) {
  font(doc, "Inter", 11, C.gray).text("Design proposal", M, 64);
  font(doc, "Inter-Bold", 34).text(design.name, M, 84, { width: CW, lineGap: 2 });
  if (project?.name) font(doc, "Inter", 14, C.gray).text(project.name, M, doc.y + 6, { width: CW });

  const facts = [
    ["Setting", cap(design.domain)],
    design.space && ["Space", design.space],
    design.style && ["Style", cap(design.style)],
    design.area && ["Area", `${design.area.toLocaleString("en-IN")} sq ft`],
    design.budget && ["Budget", inr(design.budget)],
    ["Quality target", cap(design.qualityTarget)],
  ].filter(Boolean);
  const cols = Math.min(3, facts.length);
  const colW = CW / cols;
  let y = doc.y + 26;
  facts.forEach(([label, value], i) => {
    const x = M + (i % cols) * colW;
    const row = Math.floor(i / cols);
    font(doc, "Inter", 9, C.faint).text(label, x, y + row * 46, { width: colW - 10, lineBreak: false });
    font(doc, "Inter-SemiBold", 13).text(value, x, y + row * 46 + 14, { width: colW - 10, lineBreak: false });
  });
  y += Math.ceil(facts.length / cols) * 46 + 10;

  // Estimated cost card
  const t = design.totals;
  doc.roundedRect(M, y, CW, 96, 18).fill(C.fill);
  font(doc, "Inter", 10, C.gray).text("Estimated cost", M + 22, y + 16, { lineBreak: false });
  font(doc, "Inter-Bold", 24).text(t.max > 0 ? range(t.min, t.max) : "Not priced yet", M + 22, y + 32, { width: CW - 44, lineBreak: false });
  const status =
    design.budget && t.budgetStatus
      ? { within: `Within your ${inr(design.budget)} budget`, near: `The upper estimate goes over your ${inr(design.budget)} budget`, over: `Over your ${inr(design.budget)} budget` }[t.budgetStatus]
      : design.budget
        ? `Budget ${inr(design.budget)}. Add quantities to compare.`
        : "No budget set";
  font(doc, "Inter-SemiBold", 11, t.budgetStatus ? C[BUDGET_TONE[t.budgetStatus]] : C.gray).text(status, M + 22, y + 66, { width: CW - 44, lineBreak: false });
  y += 96 + 32;

  // Palette of chosen materials
  const lines = design.components.filter((c) => c.material);
  font(doc, "Inter-SemiBold", 13).text("Materials at a glance", M, y);
  y = doc.y + 12;
  if (!lines.length) font(doc, "Inter", 11, C.gray).text("No materials have been chosen yet.", M, y);
  const shown = lines.slice(0, 8);
  const tw = (CW - 36) / 4;
  shown.forEach((c, i) => {
    const x = M + (i % 4) * (tw + 12);
    const ty = y + Math.floor(i / 4) * 118;
    tile(doc, c.material, images.get(c.material.images?.[0]?.url), x, ty, tw, 76);
    font(doc, "Inter-SemiBold", 9).text(c.material.name, x, ty + 84, { width: tw, height: 11, ellipsis: true, lineBreak: false });
    font(doc, "Inter", 8, C.gray).text(c.material.category, x, ty + 96, { width: tw, lineBreak: false });
  });
  if (lines.length > shown.length) {
    font(doc, "Inter", 9, C.gray).text(`and ${lines.length - shown.length} more, listed on the following pages`, M, y + Math.ceil(shown.length / 4) * 118, { width: CW });
  }

  font(doc, "Inter", 10, C.gray).text(
    `Prepared on ${new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}${preparedBy ? ` for ${preparedBy}` : ""}`,
    M, H - 100, { width: CW, lineBreak: false }
  );
}

function plainWords(doc, design) {
  const e = design.explanation;
  doc.addPage();
  heading(doc, "Your design in plain words", { size: 24 });
  e.overview.forEach((text) => paragraph(doc, text, { size: 11.5, after: 10 }));

  if (e.attention.length) {
    heading(doc, "What needs your attention", { size: 16, before: 10 });
    for (const item of e.attention) {
      const tone = item.level === "fail" ? "fail" : "warn";
      const body = `${item.material}: ${item.title}. ${item.text}`;
      font(doc, "Inter", 10.5);
      const h = doc.heightOfString(body, { width: CW - 18, lineGap: 2 });
      room(doc, h + 14);
      const y = doc.y;
      doc.roundedRect(M, y, 3.5, h, 1.75).fill(C[tone]);
      font(doc, "Inter-SemiBold", 10.5, C[tone]).text(`${item.material}: ${item.title}. `, M + 14, y, { width: CW - 18, continued: true, lineGap: 2 });
      font(doc, "Inter", 10.5, C.ink).text(item.text);
      gap(doc, 10);
    }
  }

  heading(doc, "Suggested next steps", { size: 16, before: 10 });
  e.nextSteps.forEach((step, i) => paragraph(doc, `${i + 1}.  ${step}`, { size: 11, after: 5 }));

}

function costSection(doc, design) {
  const t = design.totals;
  const lines = design.components.filter((c) => c.material);
  doc.addPage();
  heading(doc, "Cost and budget", { size: 24 });
  if (!lines.length) return paragraph(doc, "No materials have been chosen yet.", { color: C.gray });

  if (t.byCategory.length) {
    const top = Math.max(t.max, design.budget || 0) * 1.06 || 1;
    const labelW = 128;
    const barX = M + labelW;
    const barW = CW - labelW - 118;
    gap(doc, design.budget ? 18 : 4);
    const start = doc.y;
    for (const row of t.byCategory) {
      const y = doc.y;
      font(doc, "Inter", 10).text(row.category, M, y + 1, { width: labelW - 10, lineBreak: false, ellipsis: true });
      doc.roundedRect(barX, y, barW, 12, 6).fill("#e5e5ea");
      doc.roundedRect(barX, y, Math.max(6, (row.max / top) * barW), 12, 6).fill("#a9cdf5");
      doc.roundedRect(barX, y, Math.max(6, (row.min / top) * barW), 12, 6).fill(C.blue);
      font(doc, "Inter", 9, C.gray).text(range(row.min, row.max), barX + barW + 8, y + 1.5, { width: 110, lineBreak: false });
      doc.y = y + 26;
    }
    const chartEnd = doc.y;
    if (design.budget) {
      const x = barX + (design.budget / top) * barW;
      doc.save().dash(3, { space: 3 }).moveTo(x, start - 4).lineTo(x, doc.y - 8).lineWidth(1).strokeColor(C.ink).stroke().restore();
      font(doc, "Inter-SemiBold", 8.5).text(`Budget ${inr(design.budget)}`, x - 60, start - 18, { width: 120, align: "center", lineBreak: false });
    }
    doc.y = chartEnd;
    font(doc, "Inter", 8.5, C.faint).text("Dark bar: lowest estimate. Light bar: highest estimate.", M, doc.y, { width: CW });
    gap(doc, 20);
  }

  // Table
  const cols = [{ x: M, w: 178, label: "Material" }, { x: M + 178, w: 90, label: "Quantity" }, { x: M + 268, w: 115, label: "Price per unit" }, { x: M + 383, w: CW - 383, label: "Estimated cost", right: true }];
  const header = () => {
    const y = doc.y;
    cols.forEach((c) => font(doc, "Inter-SemiBold", 9, C.gray).text(c.label, c.x, y, { width: c.w - 8, align: c.right ? "right" : "left", lineBreak: false }));
    doc.moveTo(M, y + 16).lineTo(M + CW, y + 16).lineWidth(0.6).strokeColor(C.line).stroke();
    doc.y = y + 24;
  };
  header();
  for (const c of lines) {
    if (doc.y + 30 > BOTTOM) {
      doc.addPage();
      header();
    }
    const m = c.material;
    const y = doc.y;
    font(doc, "Inter-SemiBold", 10).text(m.name, cols[0].x, y, { width: cols[0].w - 8, height: 13, ellipsis: true, lineBreak: false });
    font(doc, "Inter", 8.5, C.gray).text(m.category + (c.size ? `, ${c.size}` : ""), cols[0].x, y + 13, { width: cols[0].w - 8, height: 11, ellipsis: true, lineBreak: false });
    font(doc, "Inter", 10).text(c.qty ? `${Math.round(c.qty * 10) / 10} ${m.unit}` : "Not entered", cols[1].x, y, { width: cols[1].w - 8, lineBreak: false });
    font(doc, "Inter", 10).text(range(m.priceMin, m.priceMax), cols[2].x, y, { width: cols[2].w - 8, lineBreak: false });
    font(doc, "Inter-SemiBold", 10).text(c.cost ? range(c.cost.min, c.cost.max) : "No cost yet", cols[3].x, y, { width: cols[3].w, align: "right", lineBreak: false });
    doc.moveTo(M, y + 30).lineTo(M + CW, y + 30).lineWidth(0.4).strokeColor(C.line).stroke();
    doc.y = y + 38;
  }
  room(doc, 40);
  const totalY = doc.y;
  font(doc, "Inter-Bold", 12).text("Total estimate", cols[0].x, totalY, { width: 200, lineBreak: false });
  font(doc, "Inter-Bold", 12).text(t.max > 0 ? range(t.min, t.max) : "Not priced yet", M + 200, totalY, { width: CW - 200, align: "right", lineBreak: false });
  doc.y = totalY + 30;
  legend(doc);
}

// Explains the numbers and symbols used in this document.
function legend(doc) {
  const key = [
    ["Cost ranges.", "Each material has a lowest and a highest price. The low figure uses every lowest price and the high figure uses every highest price."],
    ["Verdicts.", "Every material is checked against this design's setting, style, quality target, water and weather exposure, traffic, size and budget. \"Fits\" means all checks passed, \"Fits with a few notes\" means some need a look, and \"Not a good match\" means at least one is a real problem."],
    ["Quality and ratings.", "Quality runs from economy to luxury. The bars show 1 to 5 for durability, water resistance, weather resistance and ease of upkeep."],
  ];
  const inner = CW - 40;
  font(doc, "Inter", 9.5);
  const heights = key.map(([lead, text]) => doc.heightOfString(`${lead} ${text}`, { width: inner, lineGap: 2 }) + 6);
  const total = 50 + heights.reduce((a, b) => a + b, 0);
  gap(doc, 10);
  room(doc, total);
  const y = doc.y;
  doc.roundedRect(M, y, CW, total, 16).fill(C.fill);
  font(doc, "Inter-SemiBold", 12).text("How to read this proposal", M + 20, y + 16);
  doc.y = y + 40;
  for (const [lead, text] of key) {
    font(doc, "Inter-SemiBold", 9.5).text(`${lead} `, M + 20, doc.y, { width: inner, continued: true, lineGap: 2 });
    font(doc, "Inter", 9.5, C.gray).text(text);
    gap(doc, 6);
  }
  doc.y = y + total;
}

async function pictures(doc, title, files, images, { pageEach = false, columns = 2 } = {}) {
  const ok = files.filter((f) => f.kind !== "pdf");
  if (!ok.length) return;
  if (pageEach) {
    for (const f of ok) {
      doc.addPage();
      heading(doc, title, { size: 24 });
      font(doc, "Inter", 10, C.gray).text(f.name, M, doc.y, { width: CW });
      gap(doc, 12);
      const img = images.get(f.url);
      const boxH = BOTTOM - doc.y - 10;
      if (img) {
        const scale = Math.min(CW / img.width, boxH / img.height, 1.6);
        const w = img.width * scale;
        const h = img.height * scale;
        doc.roundedRect(M, doc.y, CW, h + 0.1, 0).lineWidth(0).stroke();
        doc.image(img.data, M + (CW - w) / 2, doc.y, { width: w, height: h });
      } else font(doc, "Inter", 11, C.gray).text("This image could not be read.", M, doc.y);
    }
    return;
  }
  doc.addPage();
  heading(doc, title, { size: 24 });
  const w = (CW - 16 * (columns - 1)) / columns;
  const h = w * 0.7;
  ok.forEach((f, i) => {
    const col = i % columns;
    if (col === 0 && doc.y + h + 30 > BOTTOM) doc.addPage();
    const y = col === 0 ? doc.y : doc._rowY;
    if (col === 0) doc._rowY = y;
    const x = M + col * (w + 16);
    tile(doc, null, images.get(f.url), x, y, w, h);
    font(doc, "Inter", 8.5, C.gray).text(f.name, x, y + h + 6, { width: w, height: 11, ellipsis: true, lineBreak: false });
    if (col === columns - 1 || i === ok.length - 1) doc.y = y + h + 30;
  });
}

function materialBlock(doc, c, expl, images) {
  const m = c.material;
  doc.addPage();
  const top = doc.y;

  tile(doc, m, images.get(m.images?.[0]?.url), M, top, 150, 112);
  const x = M + 168;
  const w = CW - 168;
  font(doc, "Inter", 10, C.faint).text(m.category + (m.brand && m.brand !== "Generic" ? `, ${m.brand}` : ""), x, top, { width: w, lineBreak: false });
  font(doc, "Inter-Bold", 20).text(m.name, x, top + 15, { width: w, height: 48, lineGap: 1 });
  const afterName = Math.max(doc.y, top + 44);
  font(doc, "Inter", 10, C.gray).text(
    `${cap(m.quality)} grade, ${m.domain === "both" ? "interior and exterior" : m.domain} use${m.lifespanYears ? `, lasts about ${m.lifespanYears} years` : ""}`,
    x, afterName + 2, { width: w }
  );
  const priceY = doc.y + 6;
  font(doc, "Inter-SemiBold", 11).text(`${range(m.priceMin, m.priceMax)} per ${m.unit}`, x, priceY, { width: w, lineBreak: false });
  font(doc, "Inter", 10, C.gray).text(c.cost ? `This line: ${range(c.cost.min, c.cost.max)}` : "This line: enter a quantity for a cost", x, priceY + 16, { width: w, lineBreak: false });
  const tone = VERDICT_TONE[c.fit.verdict];
  chip(doc, VERDICT_TEXT[c.fit.verdict], x, priceY + 38, tone);

  doc.y = top + 128;
  // Ratings
  const ry = doc.y;
  meter(doc, "Durability", m.durability, M, ry);
  meter(doc, "Water resistance", m.waterResistance, M + CW / 2, ry);
  meter(doc, "Weather resistance", m.weatherResistance, M, ry + 17);
  meter(doc, "Ease of upkeep", m.easeOfUpkeep, M + CW / 2, ry + 17);
  doc.y = ry + 46;

  // What was chosen
  font(doc, "Inter-SemiBold", 12).text("What you chose", M, doc.y);
  gap(doc, 4);
  expl.summary.forEach((s) => paragraph(doc, s, { size: 10.5, after: 4 }));

  // The checks
  gap(doc, 8);
  room(doc, 80);
  font(doc, "Inter-SemiBold", 12).text("Does it fit this design?", M, doc.y);
  gap(doc, 6);
  for (const check of c.fit.checks) {
    const body = `${check.title}. ${check.detail}`;
    font(doc, "Inter", 10);
    room(doc, doc.heightOfString(body, { width: CW - 24, lineGap: 2 }) + 12);
    const y = doc.y;
    doc.circle(M + 5, y + 6, 4.5).fill(C[check.status]);
    font(doc, "Inter-SemiBold", 10, C[check.status]).text(`${STATUS_WORD[check.status]}: `, M + 18, y, { width: CW - 24, continued: true, lineGap: 2 });
    font(doc, "Inter", 10, C.ink).text(body);
    gap(doc, 5);
  }

  if (m.about) {
    gap(doc, 8);
    room(doc, 70);
    font(doc, "Inter-SemiBold", 12).text("About this material", M, doc.y);
    gap(doc, 4);
    paragraph(doc, m.about, { size: 10, color: C.gray, after: 6 });
  }

  const left = [...(m.pros || []), ...(m.bestFor?.length ? ["Best for: " + m.bestFor.join("; ")] : [])];
  const right = [...(m.cons || []), ...(m.notFor?.length ? ["Not suited for: " + m.notFor.join("; ")] : [])];
  if (left.length || right.length) {
    room(doc, 90);
    const y = doc.y + 4;
    const half = (CW - 20) / 2;
    font(doc, "Inter-SemiBold", 10).text("Strengths", M, y);
    const yl = doc.y;
    bullets(doc, left, M, half);
    const endLeft = doc.y;
    font(doc, "Inter-SemiBold", 10).text("Watch out for", M + half + 20, y);
    doc.y = yl;
    bullets(doc, right, M + half + 20, half);
    doc.y = Math.max(endLeft, doc.y);
  }
}

function closing(doc, design, attachments, failed) {
  const e = design.explanation;
  doc.addPage();
  heading(doc, "Before you decide", { size: 24 });
  bullets(doc, e.notes, M, CW, C.ink, 11);
  if (attachments.length || failed.length) {
    gap(doc, 14);
    font(doc, "Inter-SemiBold", 14).text("Attached drawings", M, doc.y);
    gap(doc, 6);
    let next = doc.bufferedPageRange().count + 1;
    for (const a of attachments) {
      const last = next + a.count - 1;
      paragraph(doc, `${a.name}: page${a.count === 1 ? ` ${next}` : `s ${next} to ${last}`} of this document`, { size: 10.5, after: 3 });
      next = last + 1;
    }
    failed.forEach((name) => paragraph(doc, `${name}: could not be attached. Open the original file from the app.`, { size: 10.5, color: C.fail, after: 3 }));
  }
}

function footers(doc, design) {
  const range = doc.bufferedPageRange();
  for (let i = 1; i < range.count; i++) {
    doc.switchToPage(i);
    doc.page.margins.bottom = 0; // allows drawing inside the bottom margin without starting a new page
    font(doc, "Inter", 8.5, C.faint).text(design.name, M, H - 42, { width: CW / 2, lineBreak: false });
    font(doc, "Inter", 8.5, C.faint).text(`Page ${i + 1}`, M + CW / 2, H - 42, { width: CW / 2, align: "right", lineBreak: false });
  }
}

// ---------------------------------------------------------------- entry point

export async function buildDesignPdf({ design, project, preparedBy }) {
  // Load every image once, converted to JPEG (this also handles WebP and rotated photos).
  const urls = new Set([
    ...design.blueprints.filter((f) => f.kind !== "pdf").map((f) => f.url),
    ...design.references.map((f) => f.url),
    ...design.components.filter((c) => c.material).map((c) => c.material.images?.[0]?.url),
  ].filter(Boolean));
  const images = new Map();
  await Promise.all([...urls].map(async (url) => images.set(url, await loadImage(url))));

  // PDF drawings are attached after the last page; read them first so their page numbers are known.
  const attachments = [];
  const failed = [];
  for (const f of design.blueprints.filter((x) => x.kind === "pdf")) {
    try {
      const bytes = await fs.readFile(path.join(MEDIA_DIR, path.basename(f.url)));
      const src = await PdfLib.load(bytes, { ignoreEncryption: true });
      attachments.push({ name: f.name, src, count: src.getPageCount() });
    } catch {
      failed.push(f.name);
    }
  }

  const doc = new PDFDocument({
    size: "A4",
    margins: { top: M, left: M, right: M, bottom: 64 },
    bufferPages: true,
    info: { Title: `${design.name}, design proposal`, Author: "Construction RAG", Subject: project?.name || "" },
  });
  doc.registerFont("Inter", path.join(FONTS, "Inter-Regular.ttf"));
  doc.registerFont("Inter-SemiBold", path.join(FONTS, "Inter-SemiBold.ttf"));
  doc.registerFont("Inter-Bold", path.join(FONTS, "Inter-Bold.ttf"));
  const chunks = [];
  doc.on("data", (chunk) => chunks.push(chunk));
  const finished = new Promise((resolve) => doc.on("end", resolve));

  await cover(doc, design, project, preparedBy, images);
  plainWords(doc, design);
  costSection(doc, design);
  await pictures(doc, "Blueprint", design.blueprints, images, { pageEach: true });
  await pictures(doc, "Reference images", design.references, images);
  const explained = new Map(design.explanation.materials.map((x) => [x.componentId, x]));
  for (const c of design.components.filter((x) => x.material)) materialBlock(doc, c, explained.get(String(c._id)), images);
  closing(doc, design, attachments, failed);
  footers(doc, design);
  doc.end();
  await finished;

  const main = Buffer.concat(chunks);
  if (!attachments.length) return main;

  const out = await PdfLib.load(main);
  for (const a of attachments) {
    const pages = await out.copyPages(a.src, a.src.getPageIndices());
    pages.forEach((page) => out.addPage(page));
  }
  return Buffer.from(await out.save());
}

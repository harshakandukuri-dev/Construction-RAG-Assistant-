import multer from "multer";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { httpError } from "./http.js";

export const MEDIA_DIR = path.resolve(process.env.UPLOAD_DIR || "uploads", "media");
const EXTENSION = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "application/pdf": ".pdf" };

// Files get random names, so a file's address can't be guessed from its title.
const storage = multer.diskStorage({
  destination: (req, file, cb) => fs.mkdir(MEDIA_DIR, { recursive: true }).then(() => cb(null, MEDIA_DIR), cb),
  filename: (req, file, cb) => cb(null, crypto.randomBytes(16).toString("hex") + EXTENSION[file.mimetype]),
});

const make = (types, maxMb, message) =>
  multer({
    storage,
    limits: { fileSize: maxMb * 1024 * 1024, files: 6 },
    fileFilter: (req, file, cb) => (types.includes(file.mimetype) ? cb(null, true) : cb(httpError(400, message))),
  });

export const imageUpload = make(["image/jpeg", "image/png", "image/webp"], 8, "Use JPG, PNG or WebP images.");
export const blueprintUpload = make(
  ["image/jpeg", "image/png", "image/webp", "application/pdf"],
  20,
  "Use JPG, PNG, WebP or PDF files."
);

// The browser-reported type can be wrong or forged, so check the file's first bytes too.
async function looksRight(file) {
  const handle = await fs.open(file.path, "r");
  try {
    const { buffer } = await handle.read(Buffer.alloc(12), 0, 12, 0);
    if (file.mimetype === "image/jpeg") return buffer[0] === 0xff && buffer[1] === 0xd8;
    if (file.mimetype === "image/png") return buffer.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    if (file.mimetype === "image/webp") return buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP";
    if (file.mimetype === "application/pdf") return buffer.toString("ascii", 0, 4) === "%PDF";
    return false;
  } finally {
    await handle.close();
  }
}

// Returns the stored description of each upload; deletes everything if any file is not what it claims.
export async function accept(files = []) {
  for (const file of files) {
    if (!(await looksRight(file))) {
      await Promise.all(files.map((f) => fs.rm(f.path, { force: true })));
      throw httpError(400, `${file.originalname} isn't a valid ${EXTENSION[file.mimetype]?.slice(1) || "image"} file.`);
    }
  }
  return files.map((file) => ({
    url: `/files/${file.filename}`,
    name: file.originalname.slice(0, 120),
    kind: file.mimetype === "application/pdf" ? "pdf" : "image",
  }));
}

export const removeMedia = (items = []) =>
  Promise.all(items.map((item) => fs.rm(path.join(MEDIA_DIR, path.basename(item.url || "")), { force: true })));

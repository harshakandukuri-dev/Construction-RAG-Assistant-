import { API } from "./api";

export const inr = (n) => `₹${Math.round(n).toLocaleString("en-IN")}`;
export const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : "");
export const priceRange = (m) =>
  m.priceMin === m.priceMax ? inr(m.priceMin) : `${inr(m.priceMin)} to ${inr(m.priceMax)}`;
export const fileUrl = (url) => (url?.startsWith("http") ? url : API.replace(/\/api$/, "") + url);
export const QUALITY_LEVEL = { economy: 1, standard: 2, premium: 3, luxury: 4 };
export const AREA_UNITS = ["sq ft", "sq m"];
export const VERDICT = {
  fits: "Fits your design",
  partly: "Fits with a few notes",
  "not-suitable": "Not a good match",
};

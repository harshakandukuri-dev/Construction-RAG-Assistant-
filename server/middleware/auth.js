import jwt from "jsonwebtoken";
import { httpError } from "../lib/http.js";

export const auth = (req, res, next) => {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return next(httpError(401, "Sign in to continue."));
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    next(httpError(401, "Your session expired. Sign in again."));
  }
};

export const requireRole =
  (...roles) =>
  (req, res, next) =>
    roles.includes(req.user?.role)
      ? next()
      : next(httpError(403, "Your account can't do that. Ask an administrator."));

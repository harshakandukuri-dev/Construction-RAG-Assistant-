export const notFound = (req, res) => res.status(404).json({ error: "Not found." });

// Central error handler. Express 5 forwards rejected async handlers here.
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (res.headersSent) return res.end();

  let status = err.status || 500;
  let message = err.message;

  if (err.name === "CastError" || err.name === "ValidationError") status = 400;
  if (err.code === "LIMIT_FILE_SIZE") {
    status = 413;
    message = "That file is over 50 MB.";
  }
  if (err.code === 11000) {
    status = 409;
    message = "That already exists.";
  }
  if (err.type === "entity.parse.failed") {
    status = 400;
    message = "The request body isn't valid JSON.";
  }
  if (status >= 500) {
    console.error(err.expose ? err.message : err);
    if (!err.expose) message = "Something went wrong on the server.";
  }
  res.status(status).json({ error: message });
}

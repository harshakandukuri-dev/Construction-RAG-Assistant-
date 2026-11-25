// Small helper so route code can throw errors that carry an HTTP status.
// `expose` marks the message as safe to show to the person using the app.
export const httpError = (status, message) =>
  Object.assign(new Error(message), { status, expose: true });

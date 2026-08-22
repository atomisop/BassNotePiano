// STEP 21 — OBSERVABILITY. Next.js's own instrumentation hook — this
// `register()` export is called once per runtime (Node for the server,
// edge for middleware) before anything else in that runtime runs, which is
// what makes it the correct place to load Sentry's server/edge init rather
// than importing sentry.server.config.ts from some arbitrary server file.
// Client-side init (sentry.client.config.ts) is wired separately, via
// next.config.mjs's `withSentryConfig`.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}

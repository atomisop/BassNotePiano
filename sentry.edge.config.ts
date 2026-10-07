// STEP 21, OBSERVABILITY. Edge runtime init, this app's `src/middleware.ts`
// runs here, not in Node. Auto-loaded via next.config.mjs's
// `withSentryConfig`. DSN points at GlitchTip, not sentry.io: see
// src/instrumentation-client.ts. Deliberately minimal: the edge runtime
// doesn't support everything the Node SDK does (no beforeSend body-scrubbing
// needed here, since middleware doesn't handle raw form bodies the way
// Server Actions do, it only sees the request/response at the routing layer).
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,

  // Only the live site reports. Local dev (whose .env holds the production
  // address) and test runs used to send their errors and traces into the same
  // GlitchTip project, which burned the quota and caused 429 rate limits.
  enabled: process.env.NODE_ENV === "production",
  // Errors only. Performance traces (10% of every page load and navigation) were
  // most of the event volume and are not read anywhere.
  tracesSampleRate: 0,
});

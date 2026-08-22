// STEP 21 — OBSERVABILITY. Edge runtime init — this app's `src/middleware.ts`
// runs here, not in Node. Auto-loaded via next.config.mjs's
// `withSentryConfig`. Deliberately minimal: the edge runtime doesn't support
// everything the Node SDK does (no beforeSend body-scrubbing needed here,
// since middleware doesn't handle raw form bodies the way Server Actions
// do — it only sees the request/response at the routing layer).
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0.1,
});

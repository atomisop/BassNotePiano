// STEP 21, OBSERVABILITY. Node runtime init (Server Components, Route
// Handlers, Server Actions). Auto-loaded via next.config.mjs's
// `withSentryConfig`, nothing imports this directly. DSN points at
// GlitchTip, not sentry.io: see src/instrumentation-client.ts for why the
// real @sentry/nextjs SDK still works unmodified against it. See
// instrumentation-client.ts for the "inert with no DSN" reasoning; identical
// here with the server-side `SENTRY_DSN` var (not `NEXT_PUBLIC_`-prefixed,
// since the server doesn't need it exposed to the browser bundle).
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

  // Same scrub as the client config, server errors are exactly where a
  // caught Prisma error or a thrown SocialError/ClassBookingError could
  // otherwise carry a request body straight into Sentry's stored payload.
  beforeSend(event) {
    const scrub = (obj: Record<string, unknown> | undefined) => {
      if (!obj) return;
      for (const key of Object.keys(obj)) {
        if (/password|token|secret|dsn|code|authorization|cookie|card|referenceCode|zelleHandle|senderName|databaseUrl/i.test(key)) {
          delete obj[key];
        }
      }
    };
    scrub(event.request?.data as Record<string, unknown> | undefined);
    scrub(event.extra);
    return event;
  },
});

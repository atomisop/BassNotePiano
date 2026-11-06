// STEP 21, OBSERVABILITY. Browser-side init. This exact filename/location
// is a Next.js convention (not a Sentry-specific one), the framework loads
// it automatically before the app renders, no import needed anywhere. Named
// `sentry.client.config.ts` at the project root at first; Sentry's own dev
// server warned that file is deprecated (and stops working entirely under
// Turbopack), specifically recommending this file instead, moved rather
// than leaving a known-deprecated path in place.
//
// DSN points at GlitchTip (app.glitchtip.com), not sentry.io. GlitchTip
// implements the same ingestion protocol Sentry does, so the official
// @sentry/nextjs SDK works against it unmodified, just with a different DSN.
// See .env.example for where that value comes from.
//
// Inert until NEXT_PUBLIC_SENTRY_DSN is actually set: Sentry.init with an
// empty/undefined dsn is a documented no-op (the SDK stays loaded but never
// sends anything), so this ships safely in every environment, including
// ones that haven't configured a DSN yet, without an `if` around the whole
// file.
import * as Sentry from "@sentry/nextjs";
import { scrubEvent } from "@/lib/sentryScrub";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,

  // Only the live site reports. Local dev (whose .env holds the production
  // address) and test runs used to send their errors and traces into the same
  // GlitchTip project, which burned the quota and caused 429 rate limits.
  enabled: process.env.NODE_ENV === "production",

  // 10% of normal transactions, 100% of ones that hit an error, enough to
  // spot real performance regressions without paying to trace every request
  // on a studio-sized app. Errors are always captured regardless of this
  // number; it only governs performance/tracing volume.
  // Errors only. Performance traces (10% of every page load and navigation) were
  // most of the event volume and are not read anywhere.
  tracesSampleRate: 0,

  // Nothing but errors is sent. The SDK also sent a "session" report on every single page load and a "client report" when
  // the tab closed; GlitchTip answered those with HTTP 429 (over its limit) on every visit, which also risked real
  // errors being refused. Neither is read anywhere, so both are switched off.
  sendClientReports: false,
  integrations: (defaults) => defaults.filter((integration) => integration.name !== "BrowserSession"),

  // STEP 21 explicitly says "do not log sensitive values", Sentry's
  // default request-body/breadcrumb capture can otherwise pick up form
  // fields. `beforeSend` strips anything that looks like a credential or
  // payment reference before it ever leaves the browser, as a backstop on
  // top of not passing those values into Sentry calls in the first place.
  beforeSend(event) {
    scrubEvent(event);
    const scrub = (obj: Record<string, unknown> | undefined) => {
      if (!obj) return;
      for (const key of Object.keys(obj)) {
        if (/password|token|secret|dsn|code|authorization|cookie|card|referenceCode|zelleHandle|senderName/i.test(key)) {
          delete obj[key];
        }
      }
    };
    scrub(event.request?.data as Record<string, unknown> | undefined);
    scrub(event.extra);
    return event;
  },
});

// Required export, per the SDK's own dev-server message: without it,
// client-side route changes (App Router navigations) aren't tracked as
// their own transactions, so tracesSampleRate above would only ever see the
// initial page load.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;

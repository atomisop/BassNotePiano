// STEP 21 — OBSERVABILITY. Browser-side init. This exact filename/location
// is a Next.js convention (not a Sentry-specific one) — the framework loads
// it automatically before the app renders, no import needed anywhere. Named
// `sentry.client.config.ts` at the project root at first; Sentry's own dev
// server warned that file is deprecated (and stops working entirely under
// Turbopack), specifically recommending this file instead — moved rather
// than leaving a known-deprecated path in place.
//
// Inert until NEXT_PUBLIC_SENTRY_DSN is actually set: Sentry.init with an
// empty/undefined dsn is a documented no-op (the SDK stays loaded but never
// sends anything), so this ships safely in every environment, including
// ones that haven't configured Sentry yet, without an `if` around the whole
// file. Getting a real DSN means creating a (free) Sentry account and a
// project — not something this session can do on the user's behalf; see the
// Step 21 report for the exact steps.
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,

  // 10% of normal transactions, 100% of ones that hit an error — enough to
  // spot real performance regressions without paying to trace every request
  // on a studio-sized app. Errors are always captured regardless of this
  // number; it only governs performance/tracing volume.
  tracesSampleRate: 0.1,

  // STEP 21 explicitly says "do not log sensitive values" — Sentry's
  // default request-body/breadcrumb capture can otherwise pick up form
  // fields. `beforeSend` strips anything that looks like a credential or
  // payment reference before it ever leaves the browser, as a backstop on
  // top of not passing those values into Sentry calls in the first place.
  beforeSend(event) {
    const scrub = (obj: Record<string, unknown> | undefined) => {
      if (!obj) return;
      for (const key of Object.keys(obj)) {
        if (/password|token|secret|dsn|referenceCode|zelleHandle|senderName/i.test(key)) {
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

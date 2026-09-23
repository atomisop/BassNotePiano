import { withSentryConfig } from "@sentry/nextjs";

/** @type {import('next').NextConfig} */
const nextConfig = {
  // resend declares @react-email/render as an *optional* peer dependency
  // (used only for rendering JSX email templates): this app never passes
  // resend a `react:` template, only plain html/text strings (see
  // src/lib/email.ts), so it's never actually needed and was never
  // installed. Without this, webpack still tries to statically resolve
  // resend's internal reference to it and fails the whole build with
  // "Module not found: Can't resolve '@react-email/render'" the moment any
  // route imports something that transitively reaches src/lib/email.ts.
  // Marking resend external hands its `require` calls to Node directly at
  // runtime instead, the same as running outside a bundler, where an
  // unused optional dependency is simply never touched.
  experimental: {
    serverComponentsExternalPackages: ["resend"],
  },

  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
    ],
  },

  // Security headers — the first batch added in the Step 5 security-fixes
  // pass; the CSP/COOP pair below added in a later security-audit pass once
  // every real script/style/media/font/connect origin had actually been
  // enumerated (see the CSP comment for how).
  async headers() {
    // R2_PUBLIC_URL is the one real per-deployment origin this policy needs
    // (lesson video/PDF/avatars are served straight from it, per storage.ts)
    // — read from env rather than hardcoded so a bucket/domain change here
    // never means editing this file too. Falls back to just the R2 hostname
    // pattern being absent (no local .env set up yet) rather than crashing
    // next dev/build over a CSP header.
    const r2Origin = process.env.R2_PUBLIC_URL ? new URL(process.env.R2_PUBLIC_URL).origin : "";

    // next dev's webpack pipeline wraps every module in eval() (its default
    // eval-source-map devtool, purely for fast rebuilds/better stack traces
    // in development) — confirmed by hitting this exact CSP violation
    // locally before adding this line. That's a dev-only webpack mechanic,
    // never present in a real `next build`, so 'unsafe-eval' is scoped to
    // development only rather than weakening the real production policy for
    // a problem production doesn't actually have.
    const isDev = process.env.NODE_ENV !== "production";

    // Every real external origin this app's own client-side code actually
    // loads or connects to, confirmed by grepping the whole app rather than
    // guessed at — this is exactly the audit next.config.mjs's own comment
    // used to say was still owed:
    //   - Google Fonts: next/font/google (see src/app/layout.tsx) downloads
    //     and self-hosts the font files at build time, so the browser never
    //     requests fonts.googleapis.com/fonts.gstatic.com at all — nothing
    //     to allow here. (opengraph-image.tsx does fetch fonts.googleapis.com,
    //     but that's a server-side fetch building an OG image, not something
    //     the browser loads, so it's outside what CSP governs.)
    //   - images.unsplash.com: the one remote pattern next/image is
    //     configured for (see the `images` key above).
    //   - R2 (r2Origin): lesson video/PDF/avatars, loaded directly by
    //     <video>/<img>/<iframe>, not proxied through the app server. Also
    //     needed under connect-src, not just img/media/frame-src: the PDF
    //     viewer (react-pdf/pdfjs-dist) fetches the PDF binary itself via
    //     fetch/XHR rather than a plain src attribute.
    //   - app.glitchtip.com: where the client Sentry SDK actually ships
    //     error events (GlitchTip, not sentry.io — see
    //     project_error_monitoring_glitchtip and instrumentation-client.ts).
    //     Hardcoded rather than read from NEXT_PUBLIC_SENTRY_DSN because the
    //     DSN itself doesn't isolate cleanly to a bare origin string; update
    //     this if GlitchTip is ever moved off the app.glitchtip.com SaaS to
    //     a self-hosted instance.
    //   - /shop's Amazon links and Discord's invite link are plain <a>
    //     navigations a visitor clicks to leave the site — CSP governs what
    //     a page fetches/loads/connects to, not where its links point, so
    //     neither needs an entry here.
    //
    // script-src/style-src still carry 'unsafe-inline': Next.js's own
    // App Router emits inline bootstrap/hydration scripts (and this app adds
    // one more, THEME_BOOT_SCRIPT in src/lib/themes.ts, for the pre-hydration
    // dark-mode-flash fix), and Framer Motion drives animations through
    // inline `style` attributes — a strict nonce-based policy is possible in
    // Next 14 but means threading a per-request nonce through middleware
    // into the root layout and verifying it against every rendering path
    // (static, dynamic, RSC streaming), which is real, separate follow-up
    // work, not something to rush in alongside everything else here. Even
    // with that gap, this policy still closes off the two things that
    // actually matter most for this app's risk profile: loading a REMOTE
    // malicious script/stylesheet from anywhere but this app's own origin,
    // and exfiltrating data via img/fetch/beacon/form/frame to anywhere but
    // the specific origins listed above.
    const csp = [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
      "style-src 'self' 'unsafe-inline'",
      `img-src 'self' data: blob: https://images.unsplash.com${r2Origin ? ` ${r2Origin}` : ""}`,
      `media-src 'self'${r2Origin ? ` ${r2Origin}` : ""}`,
      `frame-src 'self'${r2Origin ? ` ${r2Origin}` : ""}`,
      "font-src 'self' data:",
      // r2Origin: react-pdf/pdfjs-dist fetches the PDF binary itself (via
      // fetch/XHR, to feed it to the wasm/JS decoder) rather than letting
      // the browser load it through a plain src attribute the way
      // <video>/<img> do above — that's a connect, not a media/img load,
      // so it needs its own entry here. Confirmed missing live: a real CSP
      // violation blocked an actual R2-hosted lesson PDF from loading
      // before this line was added.
      `connect-src 'self' https://app.glitchtip.com${r2Origin ? ` ${r2Origin}` : ""}`,
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "upgrade-insecure-requests",
    ].join("; ");

    return [
      {
        source: "/:path*",
        headers: [
          // Stops the browser from guessing a different content type than
          // what the server declared — the standard defence against a
          // handful of MIME-confusion attacks.
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Nothing in this app frames itself, and nothing else should be
          // allowed to frame it — the standard clickjacking defence.
          // frame-ancestors 'none' in the CSP below is the modern version of
          // the same rule; this stays for browsers that only honor one.
          { key: "X-Frame-Options", value: "DENY" },
          // Send full referrer info same-origin, only the origin (no path/
          // query) cross-origin. Already most browsers' own default; making
          // it explicit rather than dependent on that default.
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Confirmed via a repo-wide search: no getUserMedia/mediaDevices
          // usage anywhere. Camera/mic/location are never needed, so they're
          // switched off entirely rather than left to each browser's default.
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          // Netlify already serves everything over HTTPS; this makes that
          // guarantee explicit to the browser too. 1 year, includeSubDomains
          // — no `preload`, since submitting to browsers' preload lists is
          // a separate, harder-to-reverse decision this isn't the place to
          // make unilaterally.
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
          // This app has no OAuth popup/redirect flow (credentials-only
          // auth) and nothing that needs a cross-origin window reference —
          // same-origin isolation is pure upside here, and cheap to add now
          // rather than something a future OAuth feature has to remember to
          // reconsider.
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Content-Security-Policy", value: csp },
        ],
      },
    ];
  },
};

// STEP 21 — OBSERVABILITY. `withSentryConfig` wires the build-time pieces
// (source-map upload for readable stack traces, release tagging) around the
// Next.js config above — client/server/edge init themselves live in
// src/instrumentation-client.ts and src/instrumentation.ts, which Next.js
// loads on its own via its native instrumentation conventions, not through
// this wrapper. None of this requires a DSN to be set; with none
// configured, the SDK stays inert (see those two files) and this wrapper
// just adds a no-op layer.
//
// org/project/authToken are deliberately NOT read from env here (not an
// oversight): error events go to GlitchTip (app.glitchtip.com), not
// sentry.io, and this source-map-upload API is specifically a sentry.io
// feature GlitchTip doesn't have an equivalent of: there's no org/project
// to authenticate the upload against. Leaving all three unset makes this
// step no-op gracefully, the same as a missing DSN does; `silent: true`
// keeps that no-op quiet rather than logging "skipping X" on every build.
// Cost: production stack traces show minified code, not real source.
// `webpack.treeshake.removeDebugLogging` strips Sentry's own internal debug
// logging out of the client bundle (smaller bundle, matches this app's
// existing "don't log sensitive/internal detail" stance from Step 4) — the
// currently-documented option; an earlier version of this used the
// now-deprecated `disableLogger` flag, which Sentry's own dev-server output
// flagged directly.
export default withSentryConfig(nextConfig, {
  silent: true,
  webpack: { treeshake: { removeDebugLogging: true } },
});

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

  // Security headers — added in the Step 5 security-fixes pass. This is
  // deliberately the SAFE subset: headers whose correctness doesn't depend
  // on enumerating every real script/style/media/font origin the app uses.
  //
  // A full Content-Security-Policy is NOT included here on purpose. Getting
  // one wrong on a live app silently breaks real functionality for real
  // users — it would need to account for the R2 bucket origin (video/PDF/
  // avatars), the Unsplash remote pattern above, Google Fonts, and now
  // three.js/WebGL once Step 6's 3D work lands — and that audit deserves
  // its own careful, tested pass rather than being rushed in alongside nine
  // other Step 5 priorities. Deliberate deferral, not an oversight.
  async headers() {
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

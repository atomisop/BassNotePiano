"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

/**
 * Last-resort boundary — catches errors thrown by the root layout itself.
 *
 * Everything here is inline-styled with literal colour values, which is
 * deliberate and the opposite of what the rest of the app does. When this
 * renders, the root layout did not: that means the theme boot script never
 * ran, so every `var(--c-s-*)` the design system is built on is undefined.
 * Tailwind classes here would resolve to transparent-on-transparent and
 * produce an invisible error page — the single worst possible failure mode
 * for the component whose entire job is to be visible when nothing else works.
 *
 * It also has to supply its own <html> and <body>, since it replaces the root
 * layout rather than nesting inside it.
 */
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    console.error("Root layout error:", error);
    // STEP 21: this specific boundary is the one Sentry's own Next.js docs
    // call out by name — it's the one place a thrown error DOESN'T reach
    // Sentry's automatic instrumentation, since it replaces the root layout
    // (and everything the SDK normally hooks into) rather than nesting
    // inside it.
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#1A1A1A",
          color: "#F5F5F5",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
          padding: "24px",
        }}
      >
        <div style={{ maxWidth: 460 }}>
          <p
            style={{
              margin: 0,
              fontSize: 12,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "#D98E5A",
              fontWeight: 600,
            }}
          >
            Bass Note Piano
          </p>
          <h1
            style={{
              margin: "12px 0 0",
              fontSize: 30,
              lineHeight: 1.2,
              fontWeight: 600,
              letterSpacing: "-0.02em",
            }}
          >
            The app failed to start.
          </h1>
          <p style={{ margin: "14px 0 0", fontSize: 15, lineHeight: 1.6, color: "#AAAAAA" }}>
            This is a fault on our side. Reloading usually clears it — your account and progress
            are unaffected.
          </p>

          <button
            type="button"
            // Deliberately a real reload, not the `reset` prop Next.js
            // passes here: reset() only retries rendering this same tree,
            // which is exactly what already failed once — for a root-layout
            // crash (the common real-world case being a browser tab still
            // holding JS chunk references from before the last deploy
            // shipped) nothing about that retry can succeed, so the button
            // looked like it did nothing. A real reload re-fetches the
            // current HTML/JS from the server, which is the one thing that
            // actually can recover from that.
            onClick={() => window.location.reload()}
            style={{
              marginTop: 26,
              cursor: "pointer",
              border: "none",
              borderRadius: 999,
              background: "#D98E5A",
              color: "#0A0A0A",
              padding: "11px 22px",
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            Reload the app
          </button>

          {error.digest && (
            <p style={{ margin: "28px 0 0", fontSize: 12, color: "#888888" }}>
              Reference: {error.digest}
            </p>
          )}
        </div>
      </body>
    </html>
  );
}

"use client";

import { useEffect } from "react";
import Link from "next/link";
import * as Sentry from "@sentry/nextjs";
import { NarrowLayout } from "@/components/layout/PageLayouts";

/**
 * Error boundary for every authenticated route.
 *
 * Two rules shape what's shown here. First, `error.message` is deliberately
 * NOT rendered: in production Next replaces it with a generic string anyway,
 * and in development it can carry connection strings or query fragments from a
 * thrown Prisma error. Neither is something to put on screen. The `digest` is
 * safe and is the value that actually correlates with the server log, so
 * that's what's offered instead.
 *
 * Second, it always gives two ways out — retry the segment, or leave for a
 * page known to work. A dead end with only "something went wrong" is the state
 * this file exists to prevent.
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Server errors are already logged server-side; this catches the ones
    // thrown during client render, which otherwise leave no trace at all.
    console.error("Dashboard route error:", error);
    // STEP 21: report to Sentry too — only `error` itself (message + stack
    // + the safe `digest`), same "no sensitive values" rule this file's own
    // top comment already states for what gets rendered on screen.
    Sentry.captureException(error);
  }, [error]);

  return (
    <NarrowLayout className="flex flex-col items-start py-16">
      <p className="eyebrow">Something broke</p>
      <h1 className="mt-2 font-serif text-3xl text-slate-50">This page didn&apos;t load.</h1>
      <p className="mt-3 text-sm leading-relaxed text-slate-400">
        The problem is on our side, not yours — nothing you were working on has been lost. Try
        again, and if it keeps happening let us know.
      </p>

      <div className="mt-7 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="cta-sheen cta-fill cursor-pointer rounded-full px-5 py-2.5 text-sm font-semibold"
        >
          Try again
        </button>
        <Link
          href="/dashboard"
          className="rounded-full border border-[rgb(var(--c-s-50)/0.4)] px-5 py-2.5 text-sm font-medium text-[rgb(var(--c-s-50))] transition hover:border-[rgb(var(--c-s-50))] hover:bg-[rgb(var(--c-s-50)/0.1)]"
        >
          Back to dashboard
        </Link>
      </div>

      {error.digest && (
        <p className="mt-8 font-mono text-xs text-slate-500">
          Reference: {error.digest}
        </p>
      )}
    </NarrowLayout>
  );
}

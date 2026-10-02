"use client";

import { useEffect } from "react";
import Link from "next/link";
import * as Sentry from "@sentry/nextjs";
import { NarrowLayout } from "@/components/layout/PageLayouts";
import { Button, buttonVariants } from "@/components/ui/button";
import { Eyebrow } from "@/components/ui/Card";
import { Hero } from "@/components/ui/Hero";

/**
 * The one error screen every route boundary renders (signed-in app, auth,
 * onboarding), so a failure looks and behaves the same everywhere.
 *
 * `error.message` is deliberately NOT rendered: in production Next replaces
 * it with a generic string anyway, and in development it can carry
 * connection strings or query fragments from a thrown Prisma error. The
 * `digest` is safe and is what correlates with the server log, so that's
 * what's shown. There are always two ways out: retry, or leave for a page
 * known to work.
 */
export function ErrorScreen({
  error,
  reset,
  where,
  homeHref,
  homeLabel,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  where: string;
  homeHref: string;
  homeLabel: string;
}) {
  useEffect(() => {
    // Server errors are already logged server-side; this catches the ones
    // thrown during client render, which otherwise leave no trace at all.
    console.error(`${where} route error:`, error);
    // Report only `error` itself (message + stack + the safe digest).
    Sentry.captureException(error);
  }, [error, where]);

  return (
    <NarrowLayout className="flex flex-col items-start py-16">
      <Eyebrow>Something broke</Eyebrow>
      <Hero className="mt-2">This page didn&apos;t load.</Hero>
      <p className="mt-3 text-body text-slate-400">
        The problem is on our side, not yours. Nothing you were working on has been lost. Try again, and if it keeps
        happening let us know.
      </p>

      <div className="mt-7 flex flex-wrap items-center gap-3">
        <Button onClick={reset}>Try again</Button>
        <Link href={homeHref} className={buttonVariants({ variant: "secondary" })}>
          {homeLabel}
        </Link>
      </div>

      {error.digest && <p className="mt-8 font-mono text-small text-slate-400">Reference: {error.digest}</p>}
    </NarrowLayout>
  );
}

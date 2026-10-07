import * as Sentry from "@sentry/nextjs";

/**
 * For the places that catch an error and answer with a 500 instead of letting
 * it escape: the error would only reach the server log, which nobody reads
 * until something is already broken. This also sends it to GlitchTip. Only
 * the live site reports (see sentry.server.config.ts); elsewhere this is just
 * console.error. Never throws.
 */
export function reportError(err: unknown, where: string): void {
  console.error(`${where}:`, err);
  try {
    Sentry.captureException(err, { tags: { where } });
  } catch {
    // Reporting must never be the thing that fails.
  }
}

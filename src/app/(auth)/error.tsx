"use client";

import { ErrorScreen } from "@/components/ui/ErrorScreen";

/** Error boundary for login, register, and the other account-access pages. */
export default function AuthError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorScreen error={error} reset={reset} where="Auth" homeHref="/" homeLabel="Back to the homepage" />;
}

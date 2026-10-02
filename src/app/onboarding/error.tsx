"use client";

import { ErrorScreen } from "@/components/ui/ErrorScreen";

/** Error boundary for the first-run onboarding wizard. */
export default function OnboardingError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorScreen error={error} reset={reset} where="Onboarding" homeHref="/" homeLabel="Back to the homepage" />;
}

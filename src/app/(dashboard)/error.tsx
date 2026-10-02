"use client";

import { ErrorScreen } from "@/components/ui/ErrorScreen";

/** Error boundary for every signed-in route. See ErrorScreen for the rules. */
export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorScreen error={error} reset={reset} where="Dashboard" homeHref="/dashboard" homeLabel="Back to Home" />;
}

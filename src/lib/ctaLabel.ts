// Shared "what should the primary CTA say" logic for a scale — used by both
// ScaleRoadmap's overview cards and the course player's hero, so the two
// never drift out of sync with each other.
//
// Deliberately its own module, not exported from access.ts: access.ts pulls
// in Prisma (and, transitively via courseContent.ts, the R2/AWS SDK client)
// for its server-only logic, none of which can run in the browser.
// ScaleRoadmap.tsx is a "use client" component — importing a *runtime*
// function from access.ts would drag that whole server-only module graph
// into the client bundle. This file imports only the ScaleAccessState
// *type* (erased at compile time), so it's safe on both sides.

import type { ScaleAccessState } from "@/lib/access";

export function ctaLabel(scale: ScaleAccessState): string {
  if (scale.requiresOverrideConfirm) return "Unlock ahead";
  if (scale.reason === "locked") return "Unlock full curriculum — $69.99";
  if (scale.status === "COMPLETED") return "Review";
  if (scale.status === "IN_PROGRESS") return "Continue";
  return "Start";
}

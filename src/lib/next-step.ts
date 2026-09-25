// ============================================================================
// "What should I do right now?" — resolved from the student's real checklist
// state, nothing else.
//
// Deliberately deterministic rather than predictive. Every scale carries the
// same three-item checklist (read the module, log the practice, pass the
// quiz), and the curriculum is strictly ordered, so the next action is always
// derivable — there is nothing here a model would know that the checklist
// doesn't already say.
//
// Kept free of Prisma imports for the same reason as src/lib/ctaLabel.ts: it
// takes only the ScaleAccessState *type*, so a client component can use it
// without dragging the server-only module graph into the browser bundle.
// ============================================================================

import type { ScaleAccessState } from "@/lib/access";

export type NextStepKind =
  | "buy-curriculum"
  | "read-module"
  | "log-practice"
  | "take-quiz"
  | "curriculum-complete";

export interface NextStep {
  kind: NextStepKind;
  /** The scale the action belongs to. Absent only when nothing is unlocked. */
  scale: ScaleAccessState | null;
  /** Short label for the action itself, e.g. "Take the quiz". */
  action: string;
  /** One line of why this is next. Never invents a number. */
  detail: string;
  href: string;
  cta: string;
}

/**
 * Picks the single next action.
 *
 * Order matters and mirrors the gating in src/lib/access.ts: the first scale
 * in curriculum order that the student can reach and hasn't finished, then the
 * first unticked item of its checklist. Anything else would recommend work the
 * app would then refuse to let them do.
 */
export function resolveNextStep(roadmap: ScaleAccessState[]): NextStep {
  const reachable = roadmap.filter((scale) => scale.canAccess);

  // Nothing unlocked at all: the curriculum comes with live classes now, so
  // the only move is starting a class plan.
  if (reachable.length === 0) {
    return {
      kind: "buy-curriculum",
      scale: roadmap[0] ?? null,
      action: "Start with live classes",
      detail: "The curriculum comes with your live classes, opened one scale at a time as you and your teacher move through it.",
      href: "/billing/plans",
      cta: "See class plans",
    };
  }

  const current = reachable.find((scale) => scale.status !== "COMPLETED");

  if (!current) {
    // Every reachable scale is finished. Point at the last one for review
    // rather than inventing a "next" that doesn't exist.
    const last = reachable[reachable.length - 1];
    return {
      kind: "curriculum-complete",
      scale: last,
      action: "Revisit a scale",
      detail: "You've finished every scale open to you. Revise while your teacher releases the next one.",
      href: `/scales/${last.scaleGroup.slug}`,
      cta: "Review",
    };
  }

  const name = current.scaleGroup.kinitName ?? current.scaleGroup.title;
  const href = `/scales/${current.scaleGroup.slug}`;

  if (!current.moduleRead) {
    return {
      kind: "read-module",
      scale: current,
      action: "Work through the module",
      detail:
        current.status === "AVAILABLE"
          ? `${name} is open and waiting. Start with the lessons.`
          : `Pick up ${name} where you left off.`,
      href,
      cta: current.status === "AVAILABLE" ? "Start this scale" : "Continue",
    };
  }

  if (!current.practiceCompleted) {
    return {
      kind: "log-practice",
      scale: current,
      action: "Put in the practice",
      detail: `You've read through ${name}. Next is playing it in every key.`,
      href,
      cta: "Go to practice",
    };
  }

  // Only the quiz is left. If a previous attempt scored, say so — that's a
  // real recorded number, not a synthesised "mastery" figure.
  return {
    kind: "take-quiz",
    scale: current,
    action: "Take the quiz",
    detail:
      current.quizScore !== null
        ? `One item left on ${name}. Your last attempt scored ${current.quizScore}.`
        : `Read and practised. ${name} just needs its quiz to close out.`,
    href,
    cta: "Start the quiz",
  };
}

/**
 * Progress across the whole curriculum, counting only checklist items that are
 * actually ticked. Returns raw counts, never a synthetic "mastery percentage" —
 * the schema tracks three booleans per scale and nothing finer, so a number
 * with more precision than that would be invented.
 */
export function summariseProgress(roadmap: ScaleAccessState[]) {
  const completedScales = roadmap.filter((s) => s.status === "COMPLETED").length;
  const totalScales = roadmap.length;

  // 3 checklist items per scale is the honest denominator for "how far in".
  const itemsDone = roadmap.reduce(
    (sum, s) => sum + (s.moduleRead ? 1 : 0) + (s.practiceCompleted ? 1 : 0) + (s.quizPassed ? 1 : 0),
    0,
  );
  const itemsTotal = totalScales * 3;

  return {
    completedScales,
    totalScales,
    itemsDone,
    itemsTotal,
    percent: itemsTotal === 0 ? 0 : Math.round((itemsDone / itemsTotal) * 100),
  };
}

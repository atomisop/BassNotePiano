import { describe, expect, it } from "vitest";
import { ctaLabel } from "./ctaLabel";
import type { ScaleAccessState } from "@/lib/access";

// ctaLabel only reads requiresOverrideConfirm / reason / status, so a
// partial object covers it without needing a real ScaleGroup or dragging in
// access.ts's Prisma-backed runtime (we only import its *type* above).
function state(overrides: Partial<ScaleAccessState>): ScaleAccessState {
  return {
    scaleGroup: {} as ScaleAccessState["scaleGroup"],
    status: "AVAILABLE",
    moduleRead: false,
    practiceCompleted: false,
    quizPassed: false,
    quizScore: null,
    canAccess: true,
    reason: "unlocked",
    requiresOverrideConfirm: false,
    ...overrides,
  };
}

describe("ctaLabel", () => {
  it("prompts to unlock ahead when an override confirm is required, regardless of status", () => {
    expect(ctaLabel(state({ requiresOverrideConfirm: true, status: "COMPLETED" }))).toBe("Unlock ahead");
  });

  it("prompts to buy the curriculum when locked", () => {
    expect(ctaLabel(state({ reason: "locked", canAccess: false }))).toBe("Unlock full curriculum — $99");
  });

  it("says Review once completed", () => {
    expect(ctaLabel(state({ status: "COMPLETED" }))).toBe("Review");
  });

  it("says Continue when in progress", () => {
    expect(ctaLabel(state({ status: "IN_PROGRESS" }))).toBe("Continue");
  });

  it("says Start when available and untouched", () => {
    expect(ctaLabel(state({ status: "AVAILABLE" }))).toBe("Start");
  });

  it("prioritizes the override prompt over the locked reason", () => {
    expect(ctaLabel(state({ requiresOverrideConfirm: true, reason: "locked" }))).toBe("Unlock ahead");
  });
});

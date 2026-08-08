import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  user: { findUniqueOrThrow: vi.fn(), update: vi.fn() },
  scaleGroup: { findMany: vi.fn(), findUniqueOrThrow: vi.fn() },
  scaleProgress: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    findUniqueOrThrow: vi.fn(),
    upsert: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  quizAttempt: { create: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/gamification", () => ({
  recordPracticeActivity: vi.fn(),
  checkCourseBadges: vi.fn(),
}));
vi.mock("@/lib/courseContent", () => ({ getLessonCompletionSummary: vi.fn() }));

import {
  markModuleRead,
  recordQuizAttempt,
  unlockScaleForUser,
  grantCurriculumAccess,
  revokeCurriculumAccess,
  lockScaleForUser,
  AccessDeniedError,
  QUIZ_PASS_THRESHOLD,
} from "./access";
import { recordPracticeActivity, checkCourseBadges } from "@/lib/gamification";

const GROUP = { id: "sg1", slug: "scale-1", order: 0 };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(recordPracticeActivity).mockResolvedValue(undefined);
  vi.mocked(checkCourseBadges).mockResolvedValue(undefined);
  // Grants access to scale-1 by default (curriculum-access holder, tonic scale).
  mockPrisma.user.findUniqueOrThrow.mockResolvedValue({ hasCurriculumAccess: true });
  mockPrisma.scaleGroup.findMany.mockResolvedValue([GROUP]);
  mockPrisma.scaleProgress.findMany.mockResolvedValue([]);
});

describe("QUIZ_PASS_THRESHOLD", () => {
  it("is 80%", () => {
    expect(QUIZ_PASS_THRESHOLD).toBe(0.8);
  });
});

describe("markModuleRead", () => {
  it("throws AccessDeniedError when the user can't currently access the scale", async () => {
    mockPrisma.user.findUniqueOrThrow.mockResolvedValue({ hasCurriculumAccess: false });

    await expect(markModuleRead("u1", "scale-1")).rejects.toThrow(AccessDeniedError);
  });

  it("upserts moduleRead on the progress row for an accessible scale", async () => {
    mockPrisma.scaleProgress.upsert.mockResolvedValue({ id: "p1", status: "AVAILABLE" });
    mockPrisma.scaleProgress.findUniqueOrThrow.mockResolvedValue({
      id: "p1",
      moduleRead: true,
      practiceCompleted: false,
      quizPassed: false,
      status: "AVAILABLE",
      completedAt: null,
    });
    mockPrisma.scaleProgress.update.mockResolvedValue({ id: "p1", status: "IN_PROGRESS" });

    await markModuleRead("u1", "scale-1");

    expect(mockPrisma.scaleProgress.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: expect.objectContaining({ moduleRead: true }) }),
    );
    expect(recordPracticeActivity).toHaveBeenCalledWith("u1");
  });
});

describe("recordQuizAttempt", () => {
  function progressRow(overrides: Partial<{ status: string; moduleRead: boolean; practiceCompleted: boolean; quizPassed: boolean }> = {}) {
    return {
      id: "p1",
      moduleRead: true,
      practiceCompleted: true,
      quizPassed: false,
      status: "IN_PROGRESS",
      completedAt: null,
      ...overrides,
    };
  }

  beforeEach(() => {
    mockPrisma.scaleProgress.upsert.mockResolvedValue({ id: "p1", status: "IN_PROGRESS" });
  });

  it("passes at exactly the 80% threshold", async () => {
    mockPrisma.scaleProgress.findUniqueOrThrow.mockResolvedValue(progressRow({ quizPassed: true, status: "IN_PROGRESS" }));

    const { passed } = await recordQuizAttempt("u1", "scale-1", { score: 4, totalQuestions: 5, answers: [] });

    expect(passed).toBe(true);
    expect(mockPrisma.quizAttempt.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ result: "PASSED" }) }),
    );
  });

  it("fails just below the 80% threshold", async () => {
    mockPrisma.scaleProgress.findUniqueOrThrow.mockResolvedValue(progressRow());

    const { passed } = await recordQuizAttempt("u1", "scale-1", { score: 3, totalQuestions: 4, answers: [] }); // 75%

    expect(passed).toBe(false);
    expect(mockPrisma.quizAttempt.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ result: "FAILED" }) }),
    );
  });

  it("only ticks the quizPassed checklist item on a passing attempt", async () => {
    mockPrisma.scaleProgress.findUniqueOrThrow.mockResolvedValue(progressRow());

    await recordQuizAttempt("u1", "scale-1", { score: 1, totalQuestions: 10, answers: [] }); // 10%, fails

    expect(mockPrisma.scaleProgress.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { quizScore: 1 } }),
    );
  });

  it("triggers a course-badge check only when this attempt completes the scale's full checklist", async () => {
    // Before: quiz not yet passed, status IN_PROGRESS. After a passing
    // attempt + sync, status becomes COMPLETED (module+practice already done).
    mockPrisma.scaleProgress.findUniqueOrThrow.mockResolvedValue(
      progressRow({ moduleRead: true, practiceCompleted: true, quizPassed: true, status: "COMPLETED" }),
    );
    mockPrisma.scaleProgress.update.mockResolvedValue({ id: "p1", status: "COMPLETED" });

    await recordQuizAttempt("u1", "scale-1", { score: 5, totalQuestions: 5, answers: [] });

    expect(checkCourseBadges).toHaveBeenCalledWith("u1");
  });

  it("does not trigger a badge check when the attempt fails (checklist stays incomplete)", async () => {
    mockPrisma.scaleProgress.findUniqueOrThrow.mockResolvedValue(progressRow({ status: "IN_PROGRESS" }));

    await recordQuizAttempt("u1", "scale-1", { score: 1, totalQuestions: 10, answers: [] });

    expect(checkCourseBadges).not.toHaveBeenCalled();
  });
});

describe("unlockScaleForUser", () => {
  it("is idempotent — returns the existing row unchanged when already unlocked", async () => {
    mockPrisma.scaleGroup.findUniqueOrThrow.mockResolvedValue(GROUP);
    const existing = { id: "p1", unlockedAt: new Date("2026-01-01") };
    mockPrisma.scaleProgress.findUnique.mockResolvedValue(existing);

    const result = await unlockScaleForUser("u1", "scale-1");

    expect(result).toBe(existing);
    expect(mockPrisma.scaleProgress.upsert).not.toHaveBeenCalled();
  });

  it("grants access when there's no existing unlock", async () => {
    mockPrisma.scaleGroup.findUniqueOrThrow.mockResolvedValue(GROUP);
    mockPrisma.scaleProgress.findUnique.mockResolvedValue(null);
    mockPrisma.scaleProgress.upsert.mockResolvedValue({ id: "p1", unlockedAt: new Date() });

    await unlockScaleForUser("u1", "scale-1");

    expect(mockPrisma.scaleProgress.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ status: "AVAILABLE" }),
        create: expect.objectContaining({ status: "AVAILABLE" }),
      }),
    );
  });
});

describe("grantCurriculumAccess / revokeCurriculumAccess", () => {
  it("sets hasCurriculumAccess true and stamps curriculumUnlockedAt", async () => {
    await grantCurriculumAccess("u1");

    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { hasCurriculumAccess: true, curriculumUnlockedAt: expect.any(Date) },
    });
  });

  it("clears hasCurriculumAccess and curriculumUnlockedAt on revoke", async () => {
    await revokeCurriculumAccess("u1");

    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { hasCurriculumAccess: false, curriculumUnlockedAt: null },
    });
  });
});

describe("lockScaleForUser", () => {
  it("clears unlockedAt and resets status to LOCKED without touching checklist booleans", async () => {
    mockPrisma.scaleGroup.findUniqueOrThrow.mockResolvedValue(GROUP);

    await lockScaleForUser("u1", "scale-1");

    expect(mockPrisma.scaleProgress.updateMany).toHaveBeenCalledWith({
      where: { userId: "u1", scaleGroupId: "sg1" },
      data: { unlockedAt: null, status: "LOCKED" },
    });
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

// getRoadmap is the DB-authoritative version of the same unlocked /
// curriculum-access / locked decision middleware.ts re-derives from JWT
// claims at the edge — the two must agree, so this pins the exact branch
// matrix (unlocked row wins over curriculum access; curriculum access
// bypasses sequencing but flags out-of-order jumps; no curriculum access
// with no explicit unlock is always locked).
const mockPrisma = vi.hoisted(() => ({
  user: { findUniqueOrThrow: vi.fn() },
  scaleGroup: { findMany: vi.fn() },
  scaleProgress: { findMany: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

import { getRoadmap } from "./access";

interface FakeGroup {
  id: string;
  slug: string;
  order: number;
}

function group(order: number): FakeGroup {
  return { id: `sg${order}`, slug: `scale-${order}`, order };
}

const GROUPS = [group(0), group(1), group(2)];

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.scaleGroup.findMany.mockResolvedValue(GROUPS);
});

describe("getRoadmap", () => {
  it("locks every scale for a user with no curriculum access and no progress rows", async () => {
    mockPrisma.user.findUniqueOrThrow.mockResolvedValue({ hasCurriculumAccess: false });
    mockPrisma.scaleProgress.findMany.mockResolvedValue([]);

    const roadmap = await getRoadmap("u1");

    expect(roadmap.every((s) => s.canAccess === false)).toBe(true);
    expect(roadmap.every((s) => s.reason === "locked")).toBe(true);
    expect(roadmap.every((s) => s.status === "LOCKED")).toBe(true);
  });

  it("grants curriculum-access users the tonic scale without an override prompt", async () => {
    mockPrisma.user.findUniqueOrThrow.mockResolvedValue({ hasCurriculumAccess: true });
    mockPrisma.scaleProgress.findMany.mockResolvedValue([]);

    const roadmap = await getRoadmap("u1");

    expect(roadmap[0].canAccess).toBe(true);
    expect(roadmap[0].reason).toBe("curriculum-access");
    expect(roadmap[0].requiresOverrideConfirm).toBe(false);
  });

  it("flags every scale past the next-in-line one as requiring an override confirm for curriculum-access users", async () => {
    mockPrisma.user.findUniqueOrThrow.mockResolvedValue({ hasCurriculumAccess: true });
    mockPrisma.scaleProgress.findMany.mockResolvedValue([]);

    const roadmap = await getRoadmap("u1");

    expect(roadmap[1].canAccess).toBe(true);
    expect(roadmap[1].requiresOverrideConfirm).toBe(true);
    expect(roadmap[2].requiresOverrideConfirm).toBe(true);
  });

  it("advances the override boundary as scales are completed in order", async () => {
    mockPrisma.user.findUniqueOrThrow.mockResolvedValue({ hasCurriculumAccess: true });
    mockPrisma.scaleProgress.findMany.mockResolvedValue([
      { scaleGroupId: "sg0", status: "COMPLETED", unlockedAt: new Date() },
    ]);

    const roadmap = await getRoadmap("u1");

    // scale-0: unlocked (completed) wins over curriculum-access — no override prompt.
    expect(roadmap[0].reason).toBe("unlocked");
    expect(roadmap[0].requiresOverrideConfirm).toBe(false);
    // scale-1: next in line, no override needed.
    expect(roadmap[1].reason).toBe("curriculum-access");
    expect(roadmap[1].requiresOverrideConfirm).toBe(false);
    // scale-2: still ahead of the line.
    expect(roadmap[2].requiresOverrideConfirm).toBe(true);
  });

  it("prefers an explicit unlocked row over curriculum-access status", async () => {
    mockPrisma.user.findUniqueOrThrow.mockResolvedValue({ hasCurriculumAccess: true });
    mockPrisma.scaleProgress.findMany.mockResolvedValue([
      { scaleGroupId: "sg2", status: "AVAILABLE", unlockedAt: new Date() },
    ]);

    const roadmap = await getRoadmap("u1");

    expect(roadmap[2].reason).toBe("unlocked");
    expect(roadmap[2].requiresOverrideConfirm).toBe(false);
  });

  it("honors a legacy per-scale unlock even without curriculum access, while leaving other scales locked", async () => {
    mockPrisma.user.findUniqueOrThrow.mockResolvedValue({ hasCurriculumAccess: false });
    mockPrisma.scaleProgress.findMany.mockResolvedValue([
      { scaleGroupId: "sg1", status: "AVAILABLE", unlockedAt: new Date() },
    ]);

    const roadmap = await getRoadmap("u1");

    expect(roadmap[0].reason).toBe("locked");
    expect(roadmap[0].canAccess).toBe(false);
    expect(roadmap[1].reason).toBe("unlocked");
    expect(roadmap[1].canAccess).toBe(true);
    expect(roadmap[2].reason).toBe("locked");
  });

  it("defaults status to LOCKED and moduleRead/practiceCompleted/quizPassed to false when no progress row exists", async () => {
    mockPrisma.user.findUniqueOrThrow.mockResolvedValue({ hasCurriculumAccess: true });
    mockPrisma.scaleProgress.findMany.mockResolvedValue([]);

    const roadmap = await getRoadmap("u1");

    expect(roadmap[1]).toMatchObject({
      status: "LOCKED",
      moduleRead: false,
      practiceCompleted: false,
      quizPassed: false,
      quizScore: null,
    });
  });
});

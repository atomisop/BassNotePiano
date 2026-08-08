import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  lesson: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), delete: vi.fn() },
  scaleGroup: { findUniqueOrThrow: vi.fn() },
  lessonProgress: { upsert: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/storage", () => ({ deleteLessonFile: vi.fn(), keyFromPublicUrl: vi.fn() }));

import { getLessonCompletionSummary, createLesson } from "./courseContent";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getLessonCompletionSummary", () => {
  it("never treats zero uploaded lessons as complete (no vacuous completion)", async () => {
    mockPrisma.lesson.findMany.mockResolvedValue([]);

    const summary = await getLessonCompletionSummary("u1", "scale-1");

    expect(summary).toEqual({ hasContent: false, allComplete: false, completedCount: 0, totalCount: 0 });
  });

  it("is incomplete when only some lessons are done", async () => {
    mockPrisma.lesson.findMany.mockResolvedValue([
      { id: "l1", progress: [{ completedAt: new Date() }] },
      { id: "l2", progress: [] },
    ]);

    const summary = await getLessonCompletionSummary("u1", "scale-1");

    expect(summary).toEqual({ hasContent: true, allComplete: false, completedCount: 1, totalCount: 2 });
  });

  it("is complete only once every uploaded lesson has a completedAt", async () => {
    mockPrisma.lesson.findMany.mockResolvedValue([
      { id: "l1", progress: [{ completedAt: new Date() }] },
      { id: "l2", progress: [{ completedAt: new Date() }] },
    ]);

    const summary = await getLessonCompletionSummary("u1", "scale-1");

    expect(summary).toEqual({ hasContent: true, allComplete: true, completedCount: 2, totalCount: 2 });
  });

  it("doesn't count a progress row with a null completedAt as done", async () => {
    mockPrisma.lesson.findMany.mockResolvedValue([{ id: "l1", progress: [{ completedAt: null }] }]);

    const summary = await getLessonCompletionSummary("u1", "scale-1");

    expect(summary).toEqual({ hasContent: true, allComplete: false, completedCount: 0, totalCount: 1 });
  });
});

describe("createLesson", () => {
  it("places a new lesson at the end of the current order (last + 1)", async () => {
    mockPrisma.scaleGroup.findUniqueOrThrow.mockResolvedValue({ id: "sg1" });
    mockPrisma.lesson.findFirst.mockResolvedValue({ order: 2 });
    mockPrisma.lesson.create.mockResolvedValue({
      id: "l1",
      scaleGroupId: "sg1",
      order: 3,
      title: "New",
      description: null,
      type: "VIDEO",
      fileUrl: "https://x/y",
      fileName: "y.mp4",
      fileSizeBytes: null,
      durationSeconds: null,
      createdAt: new Date(),
    });

    await createLesson({
      scaleGroupSlug: "scale-1",
      title: "New",
      type: "VIDEO",
      fileUrl: "https://x/y",
      fileName: "y.mp4",
      uploadedById: "admin1",
    });

    expect(mockPrisma.lesson.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ order: 3 }) }),
    );
  });

  it("starts at order 0 for a scale group's first lesson", async () => {
    mockPrisma.scaleGroup.findUniqueOrThrow.mockResolvedValue({ id: "sg1" });
    mockPrisma.lesson.findFirst.mockResolvedValue(null);
    mockPrisma.lesson.create.mockResolvedValue({
      id: "l1",
      scaleGroupId: "sg1",
      order: 0,
      title: "First",
      description: null,
      type: "PDF",
      fileUrl: "https://x/y",
      fileName: "y.pdf",
      fileSizeBytes: null,
      durationSeconds: null,
      createdAt: new Date(),
    });

    await createLesson({
      scaleGroupSlug: "scale-1",
      title: "First",
      type: "PDF",
      fileUrl: "https://x/y",
      fileName: "y.pdf",
      uploadedById: "admin1",
    });

    expect(mockPrisma.lesson.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ order: 0 }) }),
    );
  });

  it("converts a numeric fileSizeBytes to a BigInt for storage, and back to a number on return", async () => {
    mockPrisma.scaleGroup.findUniqueOrThrow.mockResolvedValue({ id: "sg1" });
    mockPrisma.lesson.findFirst.mockResolvedValue(null);
    mockPrisma.lesson.create.mockResolvedValue({
      id: "l1",
      scaleGroupId: "sg1",
      order: 0,
      title: "Sized",
      description: null,
      type: "VIDEO",
      fileUrl: "https://x/y",
      fileName: "y.mp4",
      fileSizeBytes: BigInt(12345),
      durationSeconds: 60,
      createdAt: new Date(),
    });

    const result = await createLesson({
      scaleGroupSlug: "scale-1",
      title: "Sized",
      type: "VIDEO",
      fileUrl: "https://x/y",
      fileName: "y.mp4",
      fileSizeBytes: 12345,
      durationSeconds: 60,
      uploadedById: "admin1",
    });

    expect(mockPrisma.lesson.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ fileSizeBytes: BigInt(12345) }) }),
    );
    expect(result.fileSizeBytes).toBe(12345);
    expect(typeof result.fileSizeBytes).toBe("number");
  });
});

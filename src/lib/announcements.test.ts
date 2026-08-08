import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  announcement: { create: vi.fn(), findFirst: vi.fn() },
  user: { findMany: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/notifications", () => ({ createNotification: vi.fn() }));

import { createAnnouncement, getActiveAnnouncementForUser, AnnouncementError } from "./announcements";
import { createNotification } from "@/lib/notifications";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createNotification).mockResolvedValue(undefined as never);
});

describe("createAnnouncement", () => {
  it("rejects an empty title or body", async () => {
    await expect(createAnnouncement("admin1", "  ", "body")).rejects.toThrow(AnnouncementError);
    await expect(createAnnouncement("admin1", "  ", "body")).rejects.toThrow("Title can't be empty.");
    await expect(createAnnouncement("admin1", "title", "  ")).rejects.toThrow("Message can't be empty.");
  });

  it("rejects a title over 120 characters", async () => {
    await expect(createAnnouncement("admin1", "a".repeat(121), "body")).rejects.toThrow(/Title is too long/);
  });

  it("rejects a body over 1000 characters", async () => {
    await expect(createAnnouncement("admin1", "title", "a".repeat(1001))).rejects.toThrow(/Message is too long/);
  });

  it("trims title/body, creates the row, and fans a notification out to every user", async () => {
    mockPrisma.announcement.create.mockResolvedValue({ id: "a1", title: "Hi", body: "There" });
    mockPrisma.user.findMany.mockResolvedValue([{ id: "u1" }, { id: "u2" }, { id: "u3" }]);

    const result = await createAnnouncement("admin1", "  Hi  ", "  There  ");

    expect(mockPrisma.announcement.create).toHaveBeenCalledWith({
      data: { title: "Hi", body: "There", createdBy: "admin1" },
    });
    expect(createNotification).toHaveBeenCalledTimes(3);
    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "u1", type: "ANNOUNCEMENT", title: "Hi", body: "There" }),
    );
    expect(result).toEqual({ id: "a1", title: "Hi", body: "There" });
  });

  it("doesn't email — the fanout notification carries no emailCategory", async () => {
    mockPrisma.announcement.create.mockResolvedValue({ id: "a1" });
    mockPrisma.user.findMany.mockResolvedValue([{ id: "u1" }]);

    await createAnnouncement("admin1", "Title", "Body");

    const call = vi.mocked(createNotification).mock.calls[0][0];
    expect(call).not.toHaveProperty("emailCategory");
  });

  it("doesn't let one failed fanout notification blow up the whole call", async () => {
    mockPrisma.announcement.create.mockResolvedValue({ id: "a1" });
    mockPrisma.user.findMany.mockResolvedValue([{ id: "u1" }, { id: "u2" }]);
    vi.mocked(createNotification).mockRejectedValueOnce(new Error("db hiccup")).mockResolvedValueOnce(undefined as never);

    await expect(createAnnouncement("admin1", "Title", "Body")).resolves.toBeDefined();
  });
});

describe("getActiveAnnouncementForUser", () => {
  it("returns null when there's no active, undismissed announcement", async () => {
    mockPrisma.announcement.findFirst.mockResolvedValue(null);

    expect(await getActiveAnnouncementForUser("u1")).toBeNull();
  });

  it("excludes announcements this user already dismissed and returns the newest remaining one", async () => {
    mockPrisma.announcement.findFirst.mockResolvedValue({ id: "a1", title: "T", body: "B" });

    const result = await getActiveAnnouncementForUser("u1");

    expect(mockPrisma.announcement.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { active: true, dismissals: { none: { userId: "u1" } } },
        orderBy: { createdAt: "desc" },
      }),
    );
    expect(result).toEqual({ id: "a1", title: "T", body: "B" });
  });
});

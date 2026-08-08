import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  user: { findUniqueOrThrow: vi.fn(), update: vi.fn() },
  userBadge: { upsert: vi.fn() },
  scaleProgress: { count: vi.fn() },
  friendRequest: { count: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

import { checkCourseBadges, checkSocialBadges, recordPracticeActivity } from "./gamification";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("recordPracticeActivity", () => {
  it("starts a fresh streak at 1 for a user with no prior activity", async () => {
    mockPrisma.user.findUniqueOrThrow.mockResolvedValue({
      currentStreak: 0,
      longestStreak: 0,
      lastActivityDate: null,
    });

    await recordPracticeActivity("u1");

    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { currentStreak: 1, longestStreak: 1, lastActivityDate: expect.any(Date) },
    });
  });

  it("is a no-op — no write at all — when activity was already recorded today", async () => {
    mockPrisma.user.findUniqueOrThrow.mockResolvedValue({
      currentStreak: 3,
      longestStreak: 5,
      lastActivityDate: new Date(),
    });

    await recordPracticeActivity("u1");

    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });

  it("increments the streak when the last activity was exactly yesterday", async () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    mockPrisma.user.findUniqueOrThrow.mockResolvedValue({
      currentStreak: 4,
      longestStreak: 4,
      lastActivityDate: yesterday,
    });

    await recordPracticeActivity("u1");

    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { currentStreak: 5, longestStreak: 5, lastActivityDate: expect.any(Date) },
    });
  });

  it("resets the streak to 1 (not 0) after a gap of more than one day", async () => {
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    mockPrisma.user.findUniqueOrThrow.mockResolvedValue({
      currentStreak: 10,
      longestStreak: 10,
      lastActivityDate: threeDaysAgo,
    });

    await recordPracticeActivity("u1");

    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { currentStreak: 1, longestStreak: 10, lastActivityDate: expect.any(Date) },
    });
  });

  it("keeps longestStreak at its prior high water mark when the current streak resets lower", async () => {
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    mockPrisma.user.findUniqueOrThrow.mockResolvedValue({
      currentStreak: 29,
      longestStreak: 30,
      lastActivityDate: threeDaysAgo,
    });

    await recordPracticeActivity("u1");

    const data = mockPrisma.user.update.mock.calls[0][0].data;
    expect(data.currentStreak).toBe(1);
    expect(data.longestStreak).toBe(30);
  });

  it("awards every streak badge crossed by the new streak length", async () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    mockPrisma.user.findUniqueOrThrow.mockResolvedValue({
      currentStreak: 6,
      longestStreak: 6,
      lastActivityDate: yesterday,
    }); // -> new streak is 7

    await recordPracticeActivity("u1");

    const awardedCodes = mockPrisma.userBadge.upsert.mock.calls.map((c) => c[0].create.code);
    expect(awardedCodes.sort()).toEqual(["STREAK_3_DAY", "STREAK_7_DAY"].sort());
  });

  it("awards no streak badge when the new streak hasn't reached the first milestone", async () => {
    mockPrisma.user.findUniqueOrThrow.mockResolvedValue({
      currentStreak: 0,
      longestStreak: 0,
      lastActivityDate: null,
    }); // -> new streak is 1

    await recordPracticeActivity("u1");

    expect(mockPrisma.userBadge.upsert).not.toHaveBeenCalled();
  });
});

describe("checkCourseBadges", () => {
  it("awards every course milestone badge up to the current completed-scale count", async () => {
    mockPrisma.scaleProgress.count.mockResolvedValue(4);

    await checkCourseBadges("u1");

    const awardedCodes = mockPrisma.userBadge.upsert.mock.calls.map((c) => c[0].create.code);
    expect(awardedCodes.sort()).toEqual(["FIRST_LESSON_DONE", "SCALE_MASTER", "RHYTHM_SPECIALIST"].sort());
  });

  it("awards nothing at zero completed scales", async () => {
    mockPrisma.scaleProgress.count.mockResolvedValue(0);

    await checkCourseBadges("u1");

    expect(mockPrisma.userBadge.upsert).not.toHaveBeenCalled();
  });

  it("awards every course badge, including the graduate badge, at 6 completed scales", async () => {
    mockPrisma.scaleProgress.count.mockResolvedValue(6);

    await checkCourseBadges("u1");

    expect(mockPrisma.userBadge.upsert).toHaveBeenCalledTimes(5);
    const awardedCodes = mockPrisma.userBadge.upsert.mock.calls.map((c) => c[0].create.code);
    expect(awardedCodes).toContain("COURSE_GRADUATE");
  });
});

describe("checkSocialBadges", () => {
  it("awards the first-friend badge but not the catalyst badge at 1 accepted friend", async () => {
    mockPrisma.friendRequest.count.mockResolvedValue(1);

    await checkSocialBadges("u1");

    const awardedCodes = mockPrisma.userBadge.upsert.mock.calls.map((c) => c[0].create.code);
    expect(awardedCodes).toEqual(["FIRST_FRIEND_ADDED"]);
  });

  it("awards both social badges at 5+ accepted friends", async () => {
    mockPrisma.friendRequest.count.mockResolvedValue(5);

    await checkSocialBadges("u1");

    const awardedCodes = mockPrisma.userBadge.upsert.mock.calls.map((c) => c[0].create.code);
    expect(awardedCodes.sort()).toEqual(["COMMUNITY_CATALYST", "FIRST_FRIEND_ADDED"].sort());
  });
});

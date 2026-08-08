import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  classSchedule: { findMany: vi.fn() },
  classBooking: { groupBy: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/notifications", () => ({ createNotification: vi.fn() }));

import { getUpcomingOccurrences, CLASS_CAPACITY } from "./classSchedule";

// Monday, August 10 2026 — chosen (and pinned) because it's comfortably
// clear of both the March/November DST transitions covered in
// classSchedule.dst.test.ts, keeping this suite about occurrence
// derivation/sorting/capacity rather than DST edge cases.
const MONDAY = { year: 2026, month: 8, day: 10 };

function mondaySchedule(overrides: Partial<{ startTime: string }> = {}) {
  return {
    id: "sched-mon",
    dayOfWeek: 1, // Monday
    startTime: "18:00",
    durationMin: 60,
    creditCost: 2,
    label: "Monday Group",
    active: true,
    ...overrides,
  };
}

function wednesdaySchedule() {
  return {
    id: "sched-wed",
    dayOfWeek: 3, // Wednesday
    startTime: "09:00",
    durationMin: 30,
    creditCost: 1,
    label: "Wednesday Group",
    active: true,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.classBooking.groupBy.mockResolvedValue([]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("getUpcomingOccurrences", () => {
  it("returns nothing when there are no active schedules", async () => {
    mockPrisma.classSchedule.findMany.mockResolvedValue([]);

    expect(await getUpcomingOccurrences()).toEqual([]);
  });

  it("derives the next 4 occurrences of a weekly slot, one week apart, including today's if it hasn't started yet", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.UTC(MONDAY.year, MONDAY.month - 1, MONDAY.day, 14, 0))); // 10am ET Monday
    mockPrisma.classSchedule.findMany.mockResolvedValue([mondaySchedule()]);

    const occurrences = await getUpcomingOccurrences();

    expect(occurrences).toHaveLength(4);
    expect(occurrences.map((o) => o.scheduledAt.toISOString())).toEqual([
      "2026-08-10T22:00:00.000Z",
      "2026-08-17T22:00:00.000Z",
      "2026-08-24T22:00:00.000Z",
      "2026-08-31T22:00:00.000Z",
    ]);
  });

  it("skips today's occurrence once its start time has already passed", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.UTC(MONDAY.year, MONDAY.month - 1, MONDAY.day, 23, 0))); // 7pm ET Monday, after the 6pm class
    mockPrisma.classSchedule.findMany.mockResolvedValue([mondaySchedule()]);

    const occurrences = await getUpcomingOccurrences();

    expect(occurrences[0].scheduledAt.toISOString()).toBe("2026-08-17T22:00:00.000Z");
  });

  it("interleaves multiple schedules in one globally sorted, by-time list", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.UTC(MONDAY.year, MONDAY.month - 1, MONDAY.day, 14, 0)));
    mockPrisma.classSchedule.findMany.mockResolvedValue([mondaySchedule(), wednesdaySchedule()]);

    const occurrences = await getUpcomingOccurrences();

    expect(occurrences).toHaveLength(8);
    // Ascending by scheduledAt regardless of which schedule each came from.
    const times = occurrences.map((o) => o.scheduledAt.getTime());
    expect(times).toEqual([...times].sort((a, b) => a - b));
    expect(occurrences.slice(0, 2).map((o) => o.scheduleId)).toEqual(["sched-mon", "sched-wed"]);
  });

  it("reports live seat counts and correctly flags a full occurrence", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.UTC(MONDAY.year, MONDAY.month - 1, MONDAY.day, 14, 0)));
    mockPrisma.classSchedule.findMany.mockResolvedValue([mondaySchedule()]);
    mockPrisma.classBooking.groupBy.mockResolvedValue([
      { scheduleId: "sched-mon", occurrenceDate: new Date(Date.UTC(2026, 7, 10)), _count: { _all: CLASS_CAPACITY } },
      { scheduleId: "sched-mon", occurrenceDate: new Date(Date.UTC(2026, 7, 17)), _count: { _all: 3 } },
    ]);

    const occurrences = await getUpcomingOccurrences();

    expect(occurrences[0]).toMatchObject({ seatsBooked: CLASS_CAPACITY, seatsLeft: 0, isFull: true });
    expect(occurrences[1]).toMatchObject({ seatsBooked: 3, seatsLeft: CLASS_CAPACITY - 3, isFull: false });
    // No booking rows at all for the 3rd/4th occurrence — defaults to empty.
    expect(occurrences[2]).toMatchObject({ seatsBooked: 0, seatsLeft: CLASS_CAPACITY, isFull: false });
  });
});

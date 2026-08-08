import { beforeEach, describe, expect, it, vi } from "vitest";

const mockTx = vi.hoisted(() => ({
  classBooking: { count: vi.fn(), create: vi.fn(), update: vi.fn() },
  user: { updateMany: vi.fn(), update: vi.fn() },
}));

const mockPrisma = vi.hoisted(() => ({
  classSchedule: { findUniqueOrThrow: vi.fn() },
  classBooking: { findUniqueOrThrow: vi.fn() },
  user: { update: vi.fn() },
  $transaction: vi.fn(),
}));

vi.mock("@/lib/notifications", () => ({ createNotification: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

import { bookClass, cancelClassBooking, ClassBookingError, CLASS_CAPACITY, CANCELLATION_CUTOFF_HOURS } from "./classSchedule";
import { createNotification } from "@/lib/notifications";

beforeEach(() => {
  vi.clearAllMocks();
  // Runs the passed callback against the shared mockTx, mirroring
  // prisma.$transaction(async (tx) => ...) — real enough for this module's
  // control flow without a real DB.
  mockPrisma.$transaction.mockImplementation(async (fn: (tx: typeof mockTx) => unknown) => fn(mockTx));
});

// A schedule slot far enough in the future that "already started" never
// races against wall-clock `now` during the test run.
function futureSchedule(overrides: Partial<{ active: boolean; creditCost: number }> = {}) {
  const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // ~30 days out
  return {
    id: "sched1",
    active: true,
    creditCost: 1,
    startTime: `${future.getUTCHours().toString().padStart(2, "0")}:00`,
    ...overrides,
  };
}

describe("bookClass", () => {
  it("rejects booking an inactive schedule", async () => {
    mockPrisma.classSchedule.findUniqueOrThrow.mockResolvedValue(futureSchedule({ active: false }));

    await expect(bookClass("student1", "sched1", Date.now())).rejects.toThrow(ClassBookingError);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects booking an occurrence that's already started", async () => {
    mockPrisma.classSchedule.findUniqueOrThrow.mockResolvedValue({
      id: "sched1",
      active: true,
      creditCost: 1,
      startTime: "00:00",
    });

    // A date in the distant past.
    await expect(bookClass("student1", "sched1", Date.UTC(2000, 0, 1))).rejects.toThrow(
      "That class has already started or passed.",
    );
  });

  it("rejects when the occurrence is already at capacity", async () => {
    mockPrisma.classSchedule.findUniqueOrThrow.mockResolvedValue(futureSchedule());
    mockTx.classBooking.count.mockResolvedValue(CLASS_CAPACITY);

    await expect(bookClass("student1", "sched1", Date.now() + 30 * 86_400_000)).rejects.toThrow(
      "This class just filled up — pick another time.",
    );
    expect(mockTx.user.updateMany).not.toHaveBeenCalled();
  });

  it("rejects when the student doesn't have enough credits", async () => {
    mockPrisma.classSchedule.findUniqueOrThrow.mockResolvedValue(futureSchedule({ creditCost: 2 }));
    mockTx.classBooking.count.mockResolvedValue(0);
    mockTx.user.updateMany.mockResolvedValue({ count: 0 }); // the gte-credits WHERE matched nobody

    await expect(bookClass("student1", "sched1", Date.now() + 30 * 86_400_000)).rejects.toThrow(
      "You need 2 credits for this class.",
    );
    expect(mockTx.classBooking.create).not.toHaveBeenCalled();
  });

  it("spends credits and creates the booking on a successful reservation", async () => {
    mockPrisma.classSchedule.findUniqueOrThrow.mockResolvedValue(futureSchedule({ creditCost: 1 }));
    mockTx.classBooking.count.mockResolvedValue(3);
    mockTx.user.updateMany.mockResolvedValue({ count: 1 });
    mockTx.classBooking.create.mockResolvedValue({ id: "booking1" });

    const result = await bookClass("student1", "sched1", Date.now() + 30 * 86_400_000);

    expect(mockTx.user.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: "student1" }) }),
    );
    expect(mockTx.classBooking.create).toHaveBeenCalled();
    expect(result).toEqual({ id: "booking1" });
  });

  it("translates a unique-constraint violation (P2002) into a friendly already-booked error", async () => {
    mockPrisma.classSchedule.findUniqueOrThrow.mockResolvedValue(futureSchedule());
    mockPrisma.$transaction.mockRejectedValue(Object.assign(new Error("unique"), { code: "P2002" }));

    await expect(bookClass("student1", "sched1", Date.now() + 30 * 86_400_000)).rejects.toThrow(
      "You've already booked this class.",
    );
  });

  it("translates a serialization failure (P2034) into a friendly race-condition error", async () => {
    mockPrisma.classSchedule.findUniqueOrThrow.mockResolvedValue(futureSchedule());
    mockPrisma.$transaction.mockRejectedValue(Object.assign(new Error("serialization"), { code: "P2034" }));

    await expect(bookClass("student1", "sched1", Date.now() + 30 * 86_400_000)).rejects.toThrow(
      "That seat was just taken — try again.",
    );
  });
});

describe("cancelClassBooking", () => {
  function booking(hoursFromNow: number, overrides: Partial<{ studentId: string; status: string }> = {}) {
    return {
      id: "booking1",
      studentId: "student1",
      status: "SCHEDULED",
      creditsSpent: 2,
      scheduledAt: new Date(Date.now() + hoursFromNow * 3_600_000),
      ...overrides,
    };
  }

  it("rejects canceling someone else's booking", async () => {
    mockPrisma.classBooking.findUniqueOrThrow.mockResolvedValue(booking(48, { studentId: "someone-else" }));

    await expect(cancelClassBooking("booking1", "student1")).rejects.toThrow("Not your booking.");
  });

  it("rejects canceling a booking that isn't active", async () => {
    mockPrisma.classBooking.findUniqueOrThrow.mockResolvedValue(booking(48, { status: "CANCELED" }));

    await expect(cancelClassBooking("booking1", "student1")).rejects.toThrow("This booking isn't active.");
  });

  it("refunds credits when canceled at exactly the 24-hour cutoff", async () => {
    mockPrisma.classBooking.findUniqueOrThrow.mockResolvedValue(booking(CANCELLATION_CUTOFF_HOURS));
    mockPrisma.$transaction.mockImplementation(async (fn: (tx: typeof mockTx) => unknown) => fn(mockTx));

    const result = await cancelClassBooking("booking1", "student1");

    expect(result).toEqual({ refunded: true });
    expect(mockTx.classBooking.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ refunded: true }) }),
    );
    expect(mockTx.user.update).toHaveBeenCalled();
    expect(createNotification).toHaveBeenCalledWith(expect.objectContaining({ title: "Class canceled" }));
  });

  it("forfeits credits when canceled just inside the 24-hour cutoff", async () => {
    mockPrisma.classBooking.findUniqueOrThrow.mockResolvedValue(booking(CANCELLATION_CUTOFF_HOURS - 0.01));

    const result = await cancelClassBooking("booking1", "student1");

    expect(result).toEqual({ refunded: false });
    expect(mockTx.user.update).not.toHaveBeenCalled();
    expect(mockTx.classBooking.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ refunded: false }) }),
    );
  });

  it("forfeits credits for a booking whose start time has already passed", async () => {
    mockPrisma.classBooking.findUniqueOrThrow.mockResolvedValue(booking(-1));

    const result = await cancelClassBooking("booking1", "student1");

    expect(result).toEqual({ refunded: false });
  });
});

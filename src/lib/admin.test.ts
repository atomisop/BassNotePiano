import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  user: { count: vi.fn(), findUniqueOrThrow: vi.fn(), update: vi.fn() },
  zellePayment: { count: vi.fn(), aggregate: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/notifications", () => ({ createNotification: vi.fn() }));

import { getOverviewStats, setUserRole } from "./admin";
import { createNotification } from "@/lib/notifications";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getOverviewStats", () => {
  it("falls back to 0 revenue when there are no VERIFIED payments yet (aggregate sum is null)", async () => {
    mockPrisma.user.count.mockResolvedValueOnce(10).mockResolvedValueOnce(3);
    mockPrisma.zellePayment.count.mockResolvedValue(2);
    mockPrisma.zellePayment.aggregate.mockResolvedValue({ _sum: { amountCents: null } });

    const stats = await getOverviewStats();

    expect(stats).toEqual({ totalUsers: 10, curriculumUsers: 3, pendingPayments: 2, totalRevenueCents: 0 });
  });

  it("surfaces the real revenue sum when present", async () => {
    mockPrisma.user.count.mockResolvedValueOnce(10).mockResolvedValueOnce(3);
    mockPrisma.zellePayment.count.mockResolvedValue(2);
    mockPrisma.zellePayment.aggregate.mockResolvedValue({ _sum: { amountCents: 495000 } });

    const stats = await getOverviewStats();

    expect(stats.totalRevenueCents).toBe(495000);
  });
});

describe("setUserRole", () => {
  it("notifies the user when promoted from STUDENT to ADMIN", async () => {
    mockPrisma.user.findUniqueOrThrow.mockResolvedValue({ role: "STUDENT" });
    mockPrisma.user.update.mockResolvedValue({ id: "u1", role: "ADMIN" });

    await setUserRole("u1", "ADMIN");

    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "u1", type: "ROLE_UPDATED" }),
    );
  });

  it("does not notify when demoting an admin back to STUDENT", async () => {
    mockPrisma.user.findUniqueOrThrow.mockResolvedValue({ role: "ADMIN" });
    mockPrisma.user.update.mockResolvedValue({ id: "u1", role: "STUDENT" });

    await setUserRole("u1", "STUDENT");

    expect(createNotification).not.toHaveBeenCalled();
  });

  it("does not re-notify when setting a role that's already current", async () => {
    mockPrisma.user.findUniqueOrThrow.mockResolvedValue({ role: "ADMIN" });
    mockPrisma.user.update.mockResolvedValue({ id: "u1", role: "ADMIN" });

    await setUserRole("u1", "ADMIN");

    expect(createNotification).not.toHaveBeenCalled();
  });
});

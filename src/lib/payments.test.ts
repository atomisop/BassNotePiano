import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  zellePayment: {
    updateMany: vi.fn(),
    findFirst: vi.fn(),
    findUniqueOrThrow: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  scaleGroup: { findUniqueOrThrow: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/access", () => ({
  AccessDeniedError: class AccessDeniedError extends Error {},
  unlockScaleForUser: vi.fn(),
  grantCurriculumAccess: vi.fn(),
}));
vi.mock("@/lib/classSchedule", () => ({ addClassCredits: vi.fn() }));
vi.mock("@/lib/notifications", () => ({ createNotification: vi.fn() }));

import {
  getOrCreatePendingCurriculumPayment,
  getOrCreatePendingClassCreditsPayment,
  submitZellePaymentReference,
  approveZellePayment,
  rejectZellePayment,
} from "./payments";
import { AccessDeniedError, unlockScaleForUser, grantCurriculumAccess } from "@/lib/access";
import { addClassCredits } from "@/lib/classSchedule";
import { createNotification } from "@/lib/notifications";

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.zellePayment.updateMany.mockResolvedValue({ count: 0 });
});

describe("getOrCreatePendingCurriculumPayment", () => {
  it("sweeps stale AWAITING_TRANSFER rows older than 7 days before doing anything else", async () => {
    mockPrisma.zellePayment.findFirst.mockResolvedValue(null);
    mockPrisma.zellePayment.create.mockResolvedValue({ id: "p1" });

    await getOrCreatePendingCurriculumPayment("u1", 9900, "handle@zelle");

    const sweepArgs = mockPrisma.zellePayment.updateMany.mock.calls[0][0];
    expect(sweepArgs.where.status).toBe("AWAITING_TRANSFER");
    expect(sweepArgs.data.status).toBe("EXPIRED");
    const cutoff = sweepArgs.where.createdAt.lt as Date;
    const expectedCutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    expect(Math.abs(cutoff.getTime() - expectedCutoff)).toBeLessThan(5000);
  });

  it("creates a fresh AWAITING_TRANSFER row when no in-flight payment exists", async () => {
    mockPrisma.zellePayment.findFirst.mockResolvedValue(null);
    mockPrisma.zellePayment.create.mockResolvedValue({ id: "new1" });

    const result = await getOrCreatePendingCurriculumPayment("u1", 9900, "handle@zelle");

    expect(mockPrisma.zellePayment.create).toHaveBeenCalledWith({
      data: {
        userId: "u1",
        purpose: "CURRICULUM",
        amountCents: 9900,
        zelleHandle: "handle@zelle",
        lessonQuantity: undefined,
        status: "AWAITING_TRANSFER",
      },
    });
    expect(result).toEqual({ id: "new1" });
  });

  it("reuses an existing in-flight row at the same price instead of creating a duplicate", async () => {
    mockPrisma.zellePayment.findFirst.mockResolvedValue({ id: "existing1", amountCents: 9900 });

    const result = await getOrCreatePendingCurriculumPayment("u1", 9900, "handle@zelle");

    expect(mockPrisma.zellePayment.create).not.toHaveBeenCalled();
    expect(mockPrisma.zellePayment.update).not.toHaveBeenCalled();
    expect(result).toEqual({ id: "existing1", amountCents: 9900 });
  });

  it("syncs a reused row's price when the current price has changed since it was created", async () => {
    mockPrisma.zellePayment.findFirst.mockResolvedValue({ id: "existing1", amountCents: 20000 });
    mockPrisma.zellePayment.update.mockResolvedValue({ id: "existing1", amountCents: 9900 });

    const result = await getOrCreatePendingCurriculumPayment("u1", 9900, "handle@zelle");

    expect(mockPrisma.zellePayment.update).toHaveBeenCalledWith({
      where: { id: "existing1" },
      data: { amountCents: 9900 },
    });
    expect(result).toEqual({ id: "existing1", amountCents: 9900 });
  });
});

describe("getOrCreatePendingClassCreditsPayment", () => {
  it("keys the in-flight lookup on quantity, and prices via calculateClassCreditTotal", async () => {
    mockPrisma.zellePayment.findFirst.mockResolvedValue(null);
    mockPrisma.zellePayment.create.mockResolvedValue({ id: "p1" });

    await getOrCreatePendingClassCreditsPayment("u1", 10, "handle@zelle");

    expect(mockPrisma.zellePayment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ purpose: "CLASS_CREDITS", lessonQuantity: 10 }),
      }),
    );
    // 10 credits hits the 20% tier: 10 * 5000 * 0.8 = 40000
    expect(mockPrisma.zellePayment.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ amountCents: 40_000, lessonQuantity: 10 }) }),
    );
  });
});

describe("submitZellePaymentReference", () => {
  it("rejects submitting a reference for someone else's payment", async () => {
    mockPrisma.zellePayment.findUniqueOrThrow.mockResolvedValue({
      id: "p1",
      userId: "owner",
      status: "AWAITING_TRANSFER",
    });

    await expect(
      submitZellePaymentReference("intruder", "p1", { senderName: "X", referenceCode: "ABC" }),
    ).rejects.toThrow(AccessDeniedError);
  });

  it("allows submission from AWAITING_TRANSFER", async () => {
    mockPrisma.zellePayment.findUniqueOrThrow.mockResolvedValue({
      id: "p1",
      userId: "u1",
      status: "AWAITING_TRANSFER",
    });
    mockPrisma.zellePayment.update.mockResolvedValue({ id: "p1", status: "PENDING_REVIEW" });

    await submitZellePaymentReference("u1", "p1", { senderName: "X", referenceCode: "ABC" });

    expect(mockPrisma.zellePayment.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "PENDING_REVIEW" }) }),
    );
  });

  it("allows resubmission from REJECTED and clears the old rejection reason", async () => {
    mockPrisma.zellePayment.findUniqueOrThrow.mockResolvedValue({
      id: "p1",
      userId: "u1",
      status: "REJECTED",
    });
    mockPrisma.zellePayment.update.mockResolvedValue({ id: "p1", status: "PENDING_REVIEW" });

    await submitZellePaymentReference("u1", "p1", { senderName: "X", referenceCode: "ABC" });

    expect(mockPrisma.zellePayment.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ rejectionReason: null }) }),
    );
  });

  it.each(["PENDING_REVIEW", "VERIFIED", "EXPIRED"] as const)(
    "rejects resubmission when the payment is already %s",
    async (status) => {
      mockPrisma.zellePayment.findUniqueOrThrow.mockResolvedValue({ id: "p1", userId: "u1", status });

      await expect(
        submitZellePaymentReference("u1", "p1", { senderName: "X", referenceCode: "ABC" }),
      ).rejects.toThrow(/not open for submission/);
    },
  );
});

describe("approveZellePayment", () => {
  it("rejects approving a payment that isn't PENDING_REVIEW", async () => {
    mockPrisma.zellePayment.findUniqueOrThrow.mockResolvedValue({ id: "p1", status: "VERIFIED" });

    await expect(approveZellePayment("p1", "admin1")).rejects.toThrow(/not pending review/);
  });

  it("grants full curriculum access for a CURRICULUM payment", async () => {
    mockPrisma.zellePayment.findUniqueOrThrow.mockResolvedValue({
      id: "p1",
      status: "PENDING_REVIEW",
      purpose: "CURRICULUM",
      userId: "u1",
      lessonQuantity: null,
      scaleGroupId: null,
    });

    await approveZellePayment("p1", "admin1");

    expect(grantCurriculumAccess).toHaveBeenCalledWith("u1");
    expect(addClassCredits).not.toHaveBeenCalled();
    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ type: "PAYMENT_APPROVED", userId: "u1" }),
    );
  });

  it("adds class credits for a CLASS_CREDITS payment", async () => {
    mockPrisma.zellePayment.findUniqueOrThrow.mockResolvedValue({
      id: "p1",
      status: "PENDING_REVIEW",
      purpose: "CLASS_CREDITS",
      userId: "u1",
      lessonQuantity: 10,
      scaleGroupId: null,
    });

    await approveZellePayment("p1", "admin1");

    expect(addClassCredits).toHaveBeenCalledWith("u1", 10);
    expect(grantCurriculumAccess).not.toHaveBeenCalled();
  });

  it("unlocks the specific scale for a legacy per-scale payment", async () => {
    mockPrisma.zellePayment.findUniqueOrThrow.mockResolvedValue({
      id: "p1",
      status: "PENDING_REVIEW",
      purpose: "SCALE_UNLOCK",
      userId: "u1",
      lessonQuantity: null,
      scaleGroupId: "sg2",
    });
    mockPrisma.scaleGroup.findUniqueOrThrow.mockResolvedValue({ slug: "scale-2", code: "Scale 2", title: "Minor Pentatonic" });

    await approveZellePayment("p1", "admin1");

    expect(unlockScaleForUser).toHaveBeenCalledWith("u1", "scale-2");
  });

  it("always flips status to VERIFIED and stamps the reviewer, regardless of purpose", async () => {
    mockPrisma.zellePayment.findUniqueOrThrow.mockResolvedValue({
      id: "p1",
      status: "PENDING_REVIEW",
      purpose: "CURRICULUM",
      userId: "u1",
      lessonQuantity: null,
      scaleGroupId: null,
    });

    await approveZellePayment("p1", "admin7");

    expect(mockPrisma.zellePayment.update).toHaveBeenCalledWith({
      where: { id: "p1" },
      data: { status: "VERIFIED", reviewedAt: expect.any(Date), reviewedById: "admin7" },
    });
  });
});

describe("rejectZellePayment", () => {
  it("rejects rejecting a payment that isn't PENDING_REVIEW", async () => {
    mockPrisma.zellePayment.findUniqueOrThrow.mockResolvedValue({ id: "p1", status: "REJECTED" });

    await expect(rejectZellePayment("p1", "admin1", "duplicate")).rejects.toThrow(/not pending review/);
  });

  it("flips status to REJECTED, stores the reason, and notifies the student", async () => {
    mockPrisma.zellePayment.findUniqueOrThrow.mockResolvedValue({
      id: "p1",
      status: "PENDING_REVIEW",
      userId: "u1",
    });

    await rejectZellePayment("p1", "admin1", "Reference code doesn't match");

    expect(mockPrisma.zellePayment.update).toHaveBeenCalledWith({
      where: { id: "p1" },
      data: {
        status: "REJECTED",
        reviewedAt: expect.any(Date),
        reviewedById: "admin1",
        rejectionReason: "Reference code doesn't match",
      },
    });
    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ type: "PAYMENT_REJECTED", userId: "u1" }),
    );
  });
});

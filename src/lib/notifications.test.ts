import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  notification: { create: vi.fn(), count: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() },
  user: { findUnique: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/email", () => ({ sendNotificationEmail: vi.fn() }));

import { createNotification, getUnreadCount, sendEmailIfEnabled } from "./notifications";
import { sendNotificationEmail } from "@/lib/email";

const prefsAllOn = {
  email: "student@example.com",
  notifyEmailPayments: true,
  notifyEmailRoleUpdates: true,
  notifyEmailSocial: true,
  notifyEmailReminders: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.notification.create.mockResolvedValue({ id: "n1" });
  vi.mocked(sendNotificationEmail).mockResolvedValue(undefined as never);
});

describe("createNotification", () => {
  it("always writes the in-app notification row", async () => {
    await createNotification({ userId: "u1", type: "PAYMENT_APPROVED", title: "Approved" });

    expect(mockPrisma.notification.create).toHaveBeenCalledWith({
      data: { userId: "u1", type: "PAYMENT_APPROVED", title: "Approved", body: undefined },
    });
  });

  it("never touches email when no emailCategory is given", async () => {
    await createNotification({ userId: "u1", type: "PAYMENT_APPROVED", title: "Approved" });

    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
    expect(sendNotificationEmail).not.toHaveBeenCalled();
  });

  it("emails when the matching per-category preference is on", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(prefsAllOn);

    await createNotification({
      userId: "u1",
      type: "PAYMENT_APPROVED",
      title: "Approved",
      body: "details",
      emailCategory: "payments",
    });

    expect(sendNotificationEmail).toHaveBeenCalledWith("student@example.com", "Approved", "details");
  });

  it("does not email when the matching per-category preference is off", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ ...prefsAllOn, notifyEmailPayments: false });

    await createNotification({
      userId: "u1",
      type: "PAYMENT_APPROVED",
      title: "Approved",
      emailCategory: "payments",
    });

    expect(sendNotificationEmail).not.toHaveBeenCalled();
  });

  it("checks the correct preference field for each category", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ ...prefsAllOn, notifyEmailSocial: false });

    await createNotification({ userId: "u1", type: "FRIEND_REQUEST_RECEIVED", title: "T", emailCategory: "social" });

    expect(sendNotificationEmail).not.toHaveBeenCalled();
  });

  it("still resolves successfully even when the email send throws (non-blocking)", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(prefsAllOn);
    vi.mocked(sendNotificationEmail).mockRejectedValue(new Error("provider down"));

    await expect(
      createNotification({ userId: "u1", type: "PAYMENT_APPROVED", title: "Approved", emailCategory: "payments" }),
    ).resolves.toEqual({ id: "n1" });
  });

  it("does nothing when the user can't be found (e.g. deleted mid-flight)", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);

    await createNotification({ userId: "ghost", type: "PAYMENT_APPROVED", title: "T", emailCategory: "payments" });

    expect(sendNotificationEmail).not.toHaveBeenCalled();
  });
});

describe("sendEmailIfEnabled", () => {
  it("respects the same per-category preference gate as createNotification", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ ...prefsAllOn, notifyEmailReminders: false });

    await sendEmailIfEnabled("u1", "reminders", "Reminder", "body");

    expect(sendNotificationEmail).not.toHaveBeenCalled();
  });

  it("sends when enabled", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(prefsAllOn);

    await sendEmailIfEnabled("u1", "social", "New message", "body");

    expect(sendNotificationEmail).toHaveBeenCalledWith("student@example.com", "New message", "body");
  });

  it("never throws even when the send fails", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(prefsAllOn);
    vi.mocked(sendNotificationEmail).mockRejectedValue(new Error("provider down"));

    await expect(sendEmailIfEnabled("u1", "social", "T", "b")).resolves.toBeUndefined();
  });
});

describe("getUnreadCount", () => {
  it("excludes NEW_MESSAGE notifications from the bell count", async () => {
    mockPrisma.notification.count.mockResolvedValue(4);

    await getUnreadCount("u1");

    expect(mockPrisma.notification.count).toHaveBeenCalledWith({
      where: { userId: "u1", readAt: null, type: { not: "NEW_MESSAGE" } },
    });
  });
});

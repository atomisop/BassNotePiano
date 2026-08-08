import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  classRegistration: { create: vi.fn() },
  user: { findUnique: vi.fn(), findMany: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/notifications", () => ({ createNotification: vi.fn() }));
vi.mock("@/lib/email", () => ({
  sendNotificationEmail: vi.fn(),
  sendNotificationEmailWithCta: vi.fn(),
}));

import { submitClassRegistration } from "./classRegistration";
import { createNotification } from "@/lib/notifications";
import { sendNotificationEmail, sendNotificationEmailWithCta } from "@/lib/email";

const validInput = {
  fullName: "Ada Lovelace",
  email: "ada@example.com",
  phone: "555-1234",
  instrument: "PIANO_KEYBOARD" as const,
  skillLevel: "BEGINNER" as const,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.classRegistration.create.mockResolvedValue({ id: "r1", ...validInput });
  mockPrisma.user.findMany.mockResolvedValue([]);
  vi.mocked(sendNotificationEmail).mockResolvedValue(undefined as never);
  vi.mocked(sendNotificationEmailWithCta).mockResolvedValue(undefined as never);
});

describe("submitClassRegistration", () => {
  it("rejects a blank full name", async () => {
    await expect(submitClassRegistration({ ...validInput, fullName: "   " })).rejects.toThrow(
      "Full name is required.",
    );
  });

  it("rejects an invalid email address", async () => {
    await expect(submitClassRegistration({ ...validInput, email: "not-an-email" })).rejects.toThrow(
      "Enter a valid email address.",
    );
  });

  it("rejects a blank phone number", async () => {
    await expect(submitClassRegistration({ ...validInput, phone: "  " })).rejects.toThrow(
      "Phone number is required.",
    );
  });

  it("normalizes the email to lowercase and trims all fields before storing", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);

    await submitClassRegistration({
      ...validInput,
      fullName: "  Ada Lovelace  ",
      email: " Ada@Example.COM ",
      phone: " 555-1234 ",
    });

    expect(mockPrisma.classRegistration.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          fullName: "Ada Lovelace",
          email: "ada@example.com",
          phone: "555-1234",
        }),
      }),
    );
  });

  it("sends a plain confirmation email (no CTA) when the email already belongs to an account", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: "existing-user" });

    await submitClassRegistration(validInput);

    expect(sendNotificationEmail).toHaveBeenCalledWith("ada@example.com", expect.any(String), expect.any(String));
    expect(sendNotificationEmailWithCta).not.toHaveBeenCalled();
  });

  it("sends a create-an-account CTA email when no account exists for that address yet", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);

    await submitClassRegistration(validInput);

    expect(sendNotificationEmailWithCta).toHaveBeenCalledWith(
      "ada@example.com",
      expect.any(String),
      expect.any(String),
      expect.objectContaining({ label: "Create your account" }),
    );
    expect(sendNotificationEmail).not.toHaveBeenCalled();
  });

  it("notifies every admin, not the registrant, via createNotification", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockPrisma.user.findMany.mockResolvedValue([{ id: "admin1" }, { id: "admin2" }]);

    await submitClassRegistration(validInput);

    expect(mockPrisma.user.findMany).toHaveBeenCalledWith({ where: { role: "ADMIN" }, select: { id: true } });
    expect(createNotification).toHaveBeenCalledTimes(2);
    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "admin1", type: "CLASS_REGISTRATION_RECEIVED" }),
    );
  });

  it("stores empty/whitespace-only notes as null rather than an empty string", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);

    await submitClassRegistration({ ...validInput, notes: "   " });

    expect(mockPrisma.classRegistration.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ notes: null }) }),
    );
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "crypto";

const mockPrisma = vi.hoisted(() => ({
  verificationCode: {
    updateMany: vi.fn(),
    create: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/email", () => ({ sendVerificationCodeEmail: vi.fn() }));

import { createAndSendCode, createSilentCode, verifyCode } from "./verification";
import { sendVerificationCodeEmail } from "@/lib/email";

function hash(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.verificationCode.updateMany.mockResolvedValue({ count: 0 });
});

describe("createAndSendCode", () => {
  it("invalidates any still-open code for the same email+purpose before issuing a new one", async () => {
    mockPrisma.verificationCode.create.mockResolvedValue({ id: "rec1" });
    vi.mocked(sendVerificationCodeEmail).mockResolvedValue(undefined as never);

    await createAndSendCode({ email: "Student@Example.com", purpose: "LOGIN_2FA" });

    expect(mockPrisma.verificationCode.updateMany).toHaveBeenCalledWith({
      where: { email: "student@example.com", purpose: "LOGIN_2FA", consumedAt: null },
      data: { consumedAt: expect.any(Date) },
    });
  });

  it("normalizes the email to lowercase everywhere (invalidation, storage, and the send)", async () => {
    mockPrisma.verificationCode.create.mockResolvedValue({ id: "rec1" });
    vi.mocked(sendVerificationCodeEmail).mockResolvedValue(undefined as never);

    await createAndSendCode({ email: "Student@Example.COM", purpose: "EMAIL_VERIFY" });

    expect(mockPrisma.verificationCode.create.mock.calls[0][0].data.email).toBe("student@example.com");
    expect(sendVerificationCodeEmail).toHaveBeenCalledWith("student@example.com", "EMAIL_VERIFY", expect.any(String));
  });

  it("stores only the sha256 hash of the code, never the code itself", async () => {
    mockPrisma.verificationCode.create.mockResolvedValue({ id: "rec1" });
    let sentCode = "";
    vi.mocked(sendVerificationCodeEmail).mockImplementation(async (_email, _purpose, code) => {
      sentCode = code;
    });

    await createAndSendCode({ email: "a@b.com", purpose: "LOGIN_2FA" });

    const stored = mockPrisma.verificationCode.create.mock.calls[0][0].data.codeHash;
    expect(sentCode).toMatch(/^\d{6}$/);
    expect(stored).toBe(hash(sentCode));
  });

  it("still writes the code row even when the email send fails, and reports ok:false", async () => {
    mockPrisma.verificationCode.create.mockResolvedValue({ id: "rec1" });
    vi.mocked(sendVerificationCodeEmail).mockRejectedValue(new Error("provider down"));

    const result = await createAndSendCode({ email: "a@b.com", purpose: "PASSWORD_RESET" });

    expect(result).toEqual({ ok: false });
    expect(mockPrisma.verificationCode.create).toHaveBeenCalled();
  });

  it("reports ok:true when the send succeeds", async () => {
    mockPrisma.verificationCode.create.mockResolvedValue({ id: "rec1" });
    vi.mocked(sendVerificationCodeEmail).mockResolvedValue(undefined as never);

    const result = await createAndSendCode({ email: "a@b.com", purpose: "LOGIN_2FA" });

    expect(result).toEqual({ ok: true });
  });
});

describe("createSilentCode", () => {
  it("never calls the email sender", async () => {
    mockPrisma.verificationCode.create.mockResolvedValue({ id: "rec1" });

    const { code } = await createSilentCode({ email: "a@b.com", purpose: "LOGIN_2FA" });

    expect(sendVerificationCodeEmail).not.toHaveBeenCalled();
    expect(code).toMatch(/^\d{6}$/);
  });
});

describe("verifyCode", () => {
  it("fails with not_found when no open code exists for the email+purpose", async () => {
    mockPrisma.verificationCode.findFirst.mockResolvedValue(null);

    const result = await verifyCode("a@b.com", "LOGIN_2FA", "123456");

    expect(result).toEqual({ ok: false, reason: "not_found" });
  });

  it("fails with expired when past expiresAt, without consuming attempts", async () => {
    mockPrisma.verificationCode.findFirst.mockResolvedValue({
      id: "rec1",
      codeHash: hash("123456"),
      attempts: 0,
      expiresAt: new Date(Date.now() - 1000),
      userId: "u1",
      payload: null,
    });

    const result = await verifyCode("a@b.com", "LOGIN_2FA", "123456");

    expect(result).toEqual({ ok: false, reason: "expired" });
    expect(mockPrisma.verificationCode.update).not.toHaveBeenCalled();
  });

  it("locks out and consumes the code once attempts reach the 5-attempt limit", async () => {
    mockPrisma.verificationCode.findFirst.mockResolvedValue({
      id: "rec1",
      codeHash: hash("123456"),
      attempts: 5,
      expiresAt: new Date(Date.now() + 60_000),
      userId: "u1",
      payload: null,
    });

    const result = await verifyCode("a@b.com", "LOGIN_2FA", "123456");

    expect(result).toEqual({ ok: false, reason: "too_many_attempts" });
    expect(mockPrisma.verificationCode.update).toHaveBeenCalledWith({
      where: { id: "rec1" },
      data: { consumedAt: expect.any(Date) },
    });
  });

  it("increments the attempt counter on a wrong guess without consuming the code", async () => {
    mockPrisma.verificationCode.findFirst.mockResolvedValue({
      id: "rec1",
      codeHash: hash("123456"),
      attempts: 2,
      expiresAt: new Date(Date.now() + 60_000),
      userId: "u1",
      payload: null,
    });

    const result = await verifyCode("a@b.com", "LOGIN_2FA", "000000");

    expect(result).toEqual({ ok: false, reason: "incorrect" });
    expect(mockPrisma.verificationCode.update).toHaveBeenCalledWith({
      where: { id: "rec1" },
      data: { attempts: { increment: 1 } },
    });
  });

  it("succeeds and consumes the code on a correct guess, returning the stored userId/payload", async () => {
    mockPrisma.verificationCode.findFirst.mockResolvedValue({
      id: "rec1",
      codeHash: hash("123456"),
      attempts: 4, // one below the limit — should still be allowed
      expiresAt: new Date(Date.now() + 60_000),
      userId: "u1",
      payload: { pendingName: "New Name" },
    });

    const result = await verifyCode("a@b.com", "CHANGE_NAME", "123456");

    expect(result).toEqual({ ok: true, userId: "u1", payload: { pendingName: "New Name" } });
    expect(mockPrisma.verificationCode.update).toHaveBeenCalledWith({
      where: { id: "rec1" },
      data: { consumedAt: expect.any(Date) },
    });
  });

  it("normalizes email case when looking up the open code", async () => {
    mockPrisma.verificationCode.findFirst.mockResolvedValue(null);

    await verifyCode("Student@EXAMPLE.com", "LOGIN_2FA", "123456");

    expect(mockPrisma.verificationCode.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ email: "student@example.com" }) }),
    );
  });
});

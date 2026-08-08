import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "crypto";

const mockPrisma = vi.hoisted(() => ({
  trustedDevice: { findUnique: vi.fn(), create: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

import { isTrustedDevice, createTrustedDevice, TRUSTED_DEVICE_DAYS } from "./trusted-device";

function hash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("isTrustedDevice", () => {
  it("is false with no cookie token at all", async () => {
    expect(await isTrustedDevice("u1", undefined)).toBe(false);
    expect(mockPrisma.trustedDevice.findUnique).not.toHaveBeenCalled();
  });

  it("is false when no device row matches the hashed token", async () => {
    mockPrisma.trustedDevice.findUnique.mockResolvedValue(null);

    expect(await isTrustedDevice("u1", "some-raw-token")).toBe(false);
    expect(mockPrisma.trustedDevice.findUnique).toHaveBeenCalledWith({
      where: { tokenHash: hash("some-raw-token") },
    });
  });

  it("is false when the matching device belongs to a different user", async () => {
    mockPrisma.trustedDevice.findUnique.mockResolvedValue({
      userId: "someone-else",
      expiresAt: new Date(Date.now() + 60_000),
    });

    expect(await isTrustedDevice("u1", "token")).toBe(false);
  });

  it("is false once the device has expired", async () => {
    mockPrisma.trustedDevice.findUnique.mockResolvedValue({
      userId: "u1",
      expiresAt: new Date(Date.now() - 1000),
    });

    expect(await isTrustedDevice("u1", "token")).toBe(false);
  });

  it("is true for a matching, unexpired device belonging to this user", async () => {
    mockPrisma.trustedDevice.findUnique.mockResolvedValue({
      userId: "u1",
      expiresAt: new Date(Date.now() + 60_000),
    });

    expect(await isTrustedDevice("u1", "token")).toBe(true);
  });
});

describe("createTrustedDevice", () => {
  it("stores only the hash of a freshly generated token, and returns the raw token", async () => {
    mockPrisma.trustedDevice.create.mockResolvedValue({ id: "d1" });

    const rawToken = await createTrustedDevice("u1", "Chrome on Mac");

    expect(rawToken).toMatch(/^[0-9a-f]{64}$/); // 32 random bytes, hex-encoded
    const createArgs = mockPrisma.trustedDevice.create.mock.calls[0][0];
    expect(createArgs.data.tokenHash).toBe(hash(rawToken));
    expect(createArgs.data.userId).toBe("u1");
    expect(createArgs.data.label).toBe("Chrome on Mac");
  });

  it("sets expiresAt to TRUSTED_DEVICE_DAYS from now", async () => {
    mockPrisma.trustedDevice.create.mockResolvedValue({ id: "d1" });

    await createTrustedDevice("u1");

    const expiresAt = mockPrisma.trustedDevice.create.mock.calls[0][0].data.expiresAt as Date;
    const expected = Date.now() + TRUSTED_DEVICE_DAYS * 24 * 60 * 60 * 1000;
    expect(Math.abs(expiresAt.getTime() - expected)).toBeLessThan(5000);
  });

  it("generates a different token on every call", async () => {
    mockPrisma.trustedDevice.create.mockResolvedValue({ id: "d1" });

    const a = await createTrustedDevice("u1");
    const b = await createTrustedDevice("u1");

    expect(a).not.toBe(b);
  });
});

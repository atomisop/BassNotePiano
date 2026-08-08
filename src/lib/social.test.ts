import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  user: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), findMany: vi.fn(), update: vi.fn() },
  block: { findMany: vi.fn(), findFirst: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn() },
  friendRequest: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), upsert: vi.fn(), update: vi.fn(), updateMany: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
  $transaction: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/notifications", () => ({ createNotification: vi.fn() }));
vi.mock("@/lib/gamification", () => ({ checkSocialBadges: vi.fn() }));

import {
  normalizeUsername,
  isValidUsername,
  sendFriendRequest,
  respondToFriendRequest,
  blockUser,
  SocialError,
} from "./social";
import { createNotification } from "@/lib/notifications";
import { checkSocialBadges } from "@/lib/gamification";

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.$transaction.mockImplementation(async (ops: Promise<unknown>[]) => Promise.all(ops));
  vi.mocked(checkSocialBadges).mockResolvedValue(undefined);
});

describe("normalizeUsername", () => {
  it("trims, lowercases, and strips a leading @", () => {
    expect(normalizeUsername("  @Some_User  ")).toBe("some_user");
    expect(normalizeUsername("NoAt")).toBe("noat");
  });
});

describe("isValidUsername", () => {
  it("accepts 3-20 lowercase letters/digits/underscores", () => {
    expect(isValidUsername("abc")).toBe(true);
    expect(isValidUsername("a".repeat(20))).toBe(true);
    expect(isValidUsername("user_123")).toBe(true);
  });

  it("rejects too short, too long, and disallowed characters", () => {
    expect(isValidUsername("ab")).toBe(false); // 2 chars
    expect(isValidUsername("a".repeat(21))).toBe(false); // 21 chars
    expect(isValidUsername("Has-Dash")).toBe(false);
    expect(isValidUsername("Upper")).toBe(false); // must already be lowercase
    expect(isValidUsername("has space")).toBe(false);
  });
});

describe("sendFriendRequest", () => {
  it("rejects sending a request to yourself", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: "u1", username: "self" });

    await expect(sendFriendRequest("u1", "self")).rejects.toThrow("You can't add yourself.");
  });

  it("rejects when no user exists with that username", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);

    await expect(sendFriendRequest("u1", "ghost")).rejects.toThrow("No user found with that username.");
  });

  it("rejects when either side has blocked the other", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: "u2", username: "friend" });
    mockPrisma.block.findFirst.mockResolvedValue({ blockerId: "u2", blockedId: "u1" });

    await expect(sendFriendRequest("u1", "friend")).rejects.toThrow("You can't send a request to this user.");
  });

  it("rejects when already friends (reverse request already accepted)", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: "u2", username: "friend" });
    mockPrisma.block.findFirst.mockResolvedValue(null);
    mockPrisma.friendRequest.findUnique.mockResolvedValue({ id: "r1", status: "ACCEPTED" });

    await expect(sendFriendRequest("u1", "friend")).rejects.toThrow("You're already friends.");
  });

  it("auto-accepts instead of creating a mirrored duplicate when the other side already sent a pending request", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: "u2", username: "friend" });
    mockPrisma.block.findFirst.mockResolvedValue(null);
    mockPrisma.friendRequest.findUnique.mockResolvedValue({ id: "reverse1", status: "PENDING" });
    mockPrisma.friendRequest.update.mockResolvedValue({
      id: "reverse1",
      senderId: "u2",
      receiverId: "u1",
      status: "ACCEPTED",
    });

    const result = await sendFriendRequest("u1", "friend");

    expect(mockPrisma.friendRequest.update).toHaveBeenCalledWith({
      where: { id: "reverse1" },
      data: { status: "ACCEPTED", respondedAt: expect.any(Date) },
    });
    expect(mockPrisma.friendRequest.upsert).not.toHaveBeenCalled();
    expect(result.status).toBe("ACCEPTED");
    expect(createNotification).toHaveBeenCalledWith(expect.objectContaining({ type: "FRIEND_REQUEST_ACCEPTED" }));
    expect(checkSocialBadges).toHaveBeenCalledWith("u2");
    expect(checkSocialBadges).toHaveBeenCalledWith("u1");
  });

  it("creates a fresh pending request when there's no reverse request", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: "u2", username: "friend" });
    mockPrisma.block.findFirst.mockResolvedValue(null);
    mockPrisma.friendRequest.findUnique.mockResolvedValue(null);
    mockPrisma.user.findUniqueOrThrow.mockResolvedValue({ name: "Sender Name", username: "sender" });
    mockPrisma.friendRequest.upsert.mockResolvedValue({ id: "new1", status: "PENDING" });

    const result = await sendFriendRequest("u1", "friend");

    expect(mockPrisma.friendRequest.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { senderId_receiverId: { senderId: "u1", receiverId: "u2" } } }),
    );
    expect(createNotification).toHaveBeenCalledWith(expect.objectContaining({ type: "FRIEND_REQUEST_RECEIVED", userId: "u2" }));
    expect(result).toEqual({ id: "new1", status: "PENDING" });
  });

  it("normalizes the target username before lookup", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);

    await expect(sendFriendRequest("u1", "@Friend  ")).rejects.toThrow();
    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({ where: { username: "friend" } });
  });
});

describe("respondToFriendRequest", () => {
  it("rejects responding to someone else's request", async () => {
    mockPrisma.friendRequest.findUniqueOrThrow.mockResolvedValue({ id: "r1", receiverId: "other", status: "PENDING" });

    await expect(respondToFriendRequest("u1", "r1", true)).rejects.toThrow("Not your request to respond to.");
  });

  it("rejects responding to an already-handled request", async () => {
    mockPrisma.friendRequest.findUniqueOrThrow.mockResolvedValue({ id: "r1", receiverId: "u1", status: "ACCEPTED" });

    await expect(respondToFriendRequest("u1", "r1", true)).rejects.toThrow("This request has already been handled.");
  });

  it("accepts and notifies the sender", async () => {
    mockPrisma.friendRequest.findUniqueOrThrow.mockResolvedValue({ id: "r1", receiverId: "u1", status: "PENDING" });
    mockPrisma.friendRequest.update.mockResolvedValue({ id: "r1", senderId: "u2", receiverId: "u1", status: "ACCEPTED" });

    await respondToFriendRequest("u1", "r1", true);

    expect(mockPrisma.friendRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "ACCEPTED" }) }),
    );
  });

  it("rejects without notifying anyone", async () => {
    mockPrisma.friendRequest.findUniqueOrThrow.mockResolvedValue({ id: "r1", receiverId: "u1", status: "PENDING" });
    mockPrisma.friendRequest.update.mockResolvedValue({ id: "r1", status: "REJECTED" });

    await respondToFriendRequest("u1", "r1", false);

    expect(mockPrisma.friendRequest.update).toHaveBeenCalledWith({
      where: { id: "r1" },
      data: { status: "REJECTED", respondedAt: expect.any(Date) },
    });
    expect(createNotification).not.toHaveBeenCalled();
  });
});

describe("blockUser", () => {
  it("rejects blocking yourself", async () => {
    await expect(blockUser("u1", "u1")).rejects.toThrow(SocialError);
    await expect(blockUser("u1", "u1")).rejects.toThrow("You can't block yourself.");
  });

  it("upserts the block row and severs any pending/accepted friendship in one transaction", async () => {
    await blockUser("u1", "u2");

    expect(mockPrisma.$transaction).toHaveBeenCalled();
    expect(mockPrisma.block.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { blockerId_blockedId: { blockerId: "u1", blockedId: "u2" } } }),
    );
    expect(mockPrisma.friendRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "REJECTED", respondedAt: expect.any(Date) } }),
    );
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  message: { create: vi.fn(), findMany: vi.fn(), findFirst: vi.fn(), count: vi.fn(), updateMany: vi.fn() },
  block: { findFirst: vi.fn() },
  typingStatus: { deleteMany: vi.fn(), findMany: vi.fn(), upsert: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/notifications", () => ({ sendEmailIfEnabled: vi.fn() }));
vi.mock("@/lib/social", () => ({
  isFriend: vi.fn(),
  getFriendsList: vi.fn(),
  SocialError: class SocialError extends Error {},
}));

import { sendMessage, getConversationMessages } from "./messages";
import { sendEmailIfEnabled } from "@/lib/notifications";
import { isFriend, SocialError } from "@/lib/social";

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.user.findUnique.mockResolvedValue({ role: "STUDENT" });
  mockPrisma.block.findFirst.mockResolvedValue(null);
  vi.mocked(isFriend).mockResolvedValue(true);
  mockPrisma.message.create.mockResolvedValue({ id: "m1", body: "hi" });
});

describe("sendMessage", () => {
  it("rejects an empty (or whitespace-only) message", async () => {
    await expect(sendMessage("u1", "u2", "   ")).rejects.toThrow("Message can't be empty.");
    expect(mockPrisma.message.create).not.toHaveBeenCalled();
  });

  it("rejects a message over the 2000-character cap", async () => {
    await expect(sendMessage("u1", "u2", "a".repeat(2001))).rejects.toThrow(/too long/);
  });

  it("allows a message at exactly the 2000-character cap", async () => {
    await sendMessage("u1", "u2", "a".repeat(2000));
    expect(mockPrisma.message.create).toHaveBeenCalled();
  });

  it("rejects messaging yourself", async () => {
    await expect(sendMessage("u1", "u1", "hi")).rejects.toThrow("You can't message yourself.");
  });

  it("rejects messaging a non-friend when neither side is an admin", async () => {
    vi.mocked(isFriend).mockResolvedValue(false);

    await expect(sendMessage("u1", "u2", "hi")).rejects.toThrow("You can only message friends.");
  });

  it("allows messaging a non-friend when the sender is an admin", async () => {
    vi.mocked(isFriend).mockResolvedValue(false);
    mockPrisma.user.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) =>
      where.id === "u1" ? { role: "ADMIN" } : { role: "STUDENT" },
    );

    await sendMessage("u1", "u2", "hi");

    expect(mockPrisma.message.create).toHaveBeenCalled();
  });

  it("allows messaging a non-friend when the recipient is an admin", async () => {
    vi.mocked(isFriend).mockResolvedValue(false);
    mockPrisma.user.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) =>
      where.id === "u2" ? { role: "ADMIN" } : { role: "STUDENT" },
    );

    await sendMessage("u1", "u2", "hi");

    expect(mockPrisma.message.create).toHaveBeenCalled();
  });

  it("rejects messaging a blocked user even between friends", async () => {
    mockPrisma.block.findFirst.mockResolvedValue({ blockerId: "u2", blockedId: "u1" });

    await expect(sendMessage("u1", "u2", "hi")).rejects.toThrow("You can't message this user.");
  });

  it("clears any in-flight typing indicator once the message lands", async () => {
    await sendMessage("u1", "u2", "hi");

    expect(mockPrisma.typingStatus.deleteMany).toHaveBeenCalledWith({
      where: { senderId: "u1", recipientId: "u2" },
    });
  });

  it("emails the recipient if they have that notification category enabled", async () => {
    await sendMessage("u1", "u2", "hi");

    expect(sendEmailIfEnabled).toHaveBeenCalledWith("u2", "social", "New message", expect.any(String));
  });

  it("trims the message body before storing it", async () => {
    await sendMessage("u1", "u2", "  hello there  ");

    expect(mockPrisma.message.create).toHaveBeenCalledWith({
      data: { senderId: "u1", recipientId: "u2", body: "hello there" },
    });
  });
});

describe("getConversationMessages", () => {
  it("rejects reading a thread with a non-friend, non-admin user", async () => {
    vi.mocked(isFriend).mockResolvedValue(false);

    await expect(getConversationMessages("u1", "u2")).rejects.toThrow(SocialError);
  });

  it("returns the thread, oldest first, for friends", async () => {
    mockPrisma.message.findMany.mockResolvedValue([{ id: "m1" }, { id: "m2" }]);

    const result = await getConversationMessages("u1", "u2");

    expect(mockPrisma.message.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { createdAt: "asc" } }),
    );
    expect(result).toEqual([{ id: "m1" }, { id: "m2" }]);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  message: { findMany: vi.fn(), findFirst: vi.fn(), count: vi.fn() },
  pinnedConversation: { findMany: vi.fn() },
  typingStatus: { findMany: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/notifications", () => ({ sendEmailIfEnabled: vi.fn() }));
vi.mock("@/lib/social", () => ({
  isFriend: vi.fn(),
  getFriendsList: vi.fn(),
  SocialError: class SocialError extends Error {},
}));

import { getConversations } from "./messages";
import { getFriendsList } from "@/lib/social";

const alice = { id: "alice", username: "alice", name: "Alice", image: null };
const bob = { id: "bob", username: "bob", name: "Bob", image: null };

function messageRow(day: string, senderId: string, recipientId: string, body: string) {
  return { id: `m-${day}`, createdAt: new Date(day), body, senderId, recipientId };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.pinnedConversation.findMany.mockResolvedValue([]);
  mockPrisma.typingStatus.findMany.mockResolvedValue([]);
  mockPrisma.message.findFirst.mockResolvedValue(null);
  mockPrisma.message.count.mockResolvedValue(0);
  mockPrisma.message.findMany.mockResolvedValue([]);
});

describe("getConversations", () => {
  it("builds one summary per friend for a regular (non-admin) user", async () => {
    vi.mocked(getFriendsList).mockResolvedValue([alice]);
    mockPrisma.user.findUnique.mockResolvedValue({ role: "STUDENT" });

    const result = await getConversations("me");

    expect(result).toHaveLength(1);
    expect(result[0].friendId).toBe("alice");
  });

  it("orders conversations newest-activity-first", async () => {
    vi.mocked(getFriendsList).mockResolvedValue([alice, bob]);
    mockPrisma.user.findUnique.mockResolvedValue({ role: "STUDENT" });
    mockPrisma.message.findFirst.mockImplementation(async ({ where }: { where: { OR: Array<{ senderId: string; recipientId: string }> } }) => {
      const other = where.OR[0].recipientId === "me" ? where.OR[0].senderId : where.OR[0].recipientId;
      if (other === "alice") return messageRow("2026-01-01", "alice", "me", "older");
      return messageRow("2026-02-01", "bob", "me", "newer");
    });

    const result = await getConversations("me");

    expect(result.map((r) => r.friendId)).toEqual(["bob", "alice"]);
  });

  it("marks a friend as pinned and typing based on the corresponding rows", async () => {
    vi.mocked(getFriendsList).mockResolvedValue([alice]);
    mockPrisma.user.findUnique.mockResolvedValue({ role: "STUDENT" });
    mockPrisma.pinnedConversation.findMany.mockResolvedValue([{ friendId: "alice", pinOrder: 2 }]);
    mockPrisma.typingStatus.findMany.mockResolvedValue([{ senderId: "alice" }]);

    const [summary] = await getConversations("me");

    expect(summary.isPinned).toBe(true);
    expect(summary.pinOrder).toBe(2);
    expect(summary.isTyping).toBe(true);
  });

  it("reports unread count from the recipient's perspective only", async () => {
    vi.mocked(getFriendsList).mockResolvedValue([alice]);
    mockPrisma.user.findUnique.mockResolvedValue({ role: "STUDENT" });
    mockPrisma.message.count.mockResolvedValue(3);

    const [summary] = await getConversations("me");

    expect(mockPrisma.message.count).toHaveBeenCalledWith({
      where: { senderId: "alice", recipientId: "me", readAt: null },
    });
    expect(summary.unreadCount).toBe(3);
  });

  it("includes admin-bypassed threads for a regular user only when the other party is an admin", async () => {
    vi.mocked(getFriendsList).mockResolvedValue([]); // no friends
    mockPrisma.user.findUnique.mockResolvedValue({ role: "STUDENT" }); // "me" is not admin
    mockPrisma.message.findMany.mockResolvedValue([
      {
        senderId: "admin1",
        recipientId: "me",
        sender: { id: "admin1", username: "support", name: "Support", image: null, role: "ADMIN" },
        recipient: { id: "me", username: "me", name: "Me", image: null, role: "STUDENT" },
      },
      {
        senderId: "me",
        recipientId: "randomstudent",
        sender: { id: "me", username: "me", name: "Me", image: null, role: "STUDENT" },
        recipient: { id: "randomstudent", username: "rando", name: "Rando", image: null, role: "STUDENT" },
      },
    ]);

    const result = await getConversations("me");

    // Only the admin-initiated thread counts for a regular user — the
    // random-student thread (which can only exist if *I'm* the admin) doesn't.
    expect(result.map((r) => r.friendId)).toEqual(["admin1"]);
  });

  it("includes every real partner (not just admins) for an admin caller", async () => {
    vi.mocked(getFriendsList).mockResolvedValue([]);
    mockPrisma.user.findUnique.mockResolvedValue({ role: "ADMIN" }); // "me" is admin
    mockPrisma.message.findMany.mockResolvedValue([
      {
        senderId: "me",
        recipientId: "student1",
        sender: { id: "me", username: "me", name: "Me", image: null, role: "ADMIN" },
        recipient: { id: "student1", username: "s1", name: "Student One", image: null, role: "STUDENT" },
      },
    ]);

    const result = await getConversations("me");

    expect(result.map((r) => r.friendId)).toEqual(["student1"]);
  });

  it("de-dupes a partner who is both an actual friend and an admin-thread partner", async () => {
    vi.mocked(getFriendsList).mockResolvedValue([{ id: "admin1", username: "support", name: "Support", image: null }]);
    mockPrisma.user.findUnique.mockResolvedValue({ role: "STUDENT" });
    mockPrisma.message.findMany.mockResolvedValue([
      {
        senderId: "admin1",
        recipientId: "me",
        sender: { id: "admin1", username: "support", name: "Support", image: null, role: "ADMIN" },
        recipient: { id: "me", username: "me", name: "Me", image: null, role: "STUDENT" },
      },
    ]);

    const result = await getConversations("me");

    expect(result).toHaveLength(1);
  });
});

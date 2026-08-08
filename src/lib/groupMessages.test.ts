import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  user: { findMany: vi.fn(), findUnique: vi.fn() },
  groupConversation: { create: vi.fn(), findUniqueOrThrow: vi.fn(), delete: vi.fn() },
  groupMember: { findUnique: vi.fn(), update: vi.fn(), delete: vi.fn(), count: vi.fn(), findMany: vi.fn() },
  groupMessage: { create: vi.fn() },
  $transaction: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/notifications", () => ({ sendEmailIfEnabled: vi.fn() }));
vi.mock("@/lib/social", () => ({
  isFriend: vi.fn(),
  normalizeUsername: (raw: string) => raw.trim().toLowerCase().replace(/^@/, ""),
  SocialError: class SocialError extends Error {},
}));

import { createGroup, sendGroupMessage, leaveGroup } from "./groupMessages";
import { isFriend, SocialError } from "@/lib/social";

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.$transaction.mockImplementation(async (ops: Promise<unknown>[]) => Promise.all(ops));
});

describe("createGroup", () => {
  it("rejects an empty member list", async () => {
    await expect(createGroup({ creatorId: "u1", memberUsernames: [] })).rejects.toThrow(
      "Add at least one friend to the group.",
    );
  });

  it("rejects more than 23 other members (24-member cap including the creator)", async () => {
    const usernames = Array.from({ length: 24 }, (_, i) => `friend${i}`);

    await expect(createGroup({ creatorId: "u1", memberUsernames: usernames })).rejects.toThrow(/limited to 24 members/);
  });

  it("rejects when a listed username doesn't resolve to a real user", async () => {
    mockPrisma.user.findMany.mockResolvedValue([{ id: "u2", username: "real" }]);

    await expect(
      createGroup({ creatorId: "u1", memberUsernames: ["real", "ghost"] }),
    ).rejects.toThrow("No user found for: @ghost");
  });

  it("rejects when only the creator's own username was listed (after self-exclusion, nobody's left)", async () => {
    mockPrisma.user.findMany.mockResolvedValue([{ id: "u1", username: "creator" }]);

    await expect(createGroup({ creatorId: "u1", memberUsernames: ["creator"] })).rejects.toThrow(
      "Add at least one friend to the group.",
    );
  });

  it("rejects when a target user isn't actually a friend", async () => {
    mockPrisma.user.findMany.mockResolvedValue([{ id: "u2", username: "stranger" }]);
    vi.mocked(isFriend).mockResolvedValue(false);

    await expect(createGroup({ creatorId: "u1", memberUsernames: ["stranger"] })).rejects.toThrow(
      "@stranger isn't on your friends list.",
    );
  });

  it("dedupes usernames (including case/@ variants) before resolving them", async () => {
    mockPrisma.user.findMany.mockResolvedValue([{ id: "u2", username: "friend" }]);
    vi.mocked(isFriend).mockResolvedValue(true);
    mockPrisma.groupConversation.create.mockResolvedValue({ id: "g1" });

    await createGroup({ creatorId: "u1", memberUsernames: ["@Friend", "friend", " friend "] });

    expect(mockPrisma.user.findMany).toHaveBeenCalledWith({
      where: { username: { in: ["friend"] } },
      select: { id: true, username: true },
    });
  });

  it("creates the group with the creator plus every validated friend as members", async () => {
    mockPrisma.user.findMany.mockResolvedValue([
      { id: "u2", username: "alice" },
      { id: "u3", username: "bob" },
    ]);
    vi.mocked(isFriend).mockResolvedValue(true);
    mockPrisma.groupConversation.create.mockResolvedValue({ id: "g1" });

    await createGroup({ creatorId: "u1", name: "  Study Group  ", memberUsernames: ["alice", "bob"] });

    expect(mockPrisma.groupConversation.create).toHaveBeenCalledWith({
      data: {
        name: "Study Group",
        createdById: "u1",
        members: {
          create: [
            { userId: "u1", lastReadAt: expect.any(Date) },
            { userId: "u2" },
            { userId: "u3" },
          ],
        },
      },
    });
  });
});

describe("sendGroupMessage", () => {
  it("rejects an empty message", async () => {
    await expect(sendGroupMessage("u1", "g1", "   ")).rejects.toThrow("Message can't be empty.");
  });

  it("rejects a message over the 2000-character cap", async () => {
    await expect(sendGroupMessage("u1", "g1", "a".repeat(2001))).rejects.toThrow(/too long/);
  });

  it("rejects sending from someone who isn't a member", async () => {
    mockPrisma.groupMember.findUnique.mockResolvedValue(null);

    await expect(sendGroupMessage("u1", "g1", "hi")).rejects.toThrow(SocialError);
    await expect(sendGroupMessage("u1", "g1", "hi")).rejects.toThrow("You're not a member of this group.");
  });

  it("creates the message and marks the sender's own membership as read, in one transaction", async () => {
    mockPrisma.groupMember.findUnique.mockResolvedValue({ id: "mem1" });
    mockPrisma.groupMessage.create.mockResolvedValue({ id: "msg1", body: "hi" });
    mockPrisma.groupMember.update.mockResolvedValue({ id: "mem1" });
    mockPrisma.user.findUnique.mockResolvedValue({ name: "Sender" });
    mockPrisma.groupMember.findMany.mockResolvedValue([]);

    const result = await sendGroupMessage("u1", "g1", "  hello  ");

    expect(mockPrisma.$transaction).toHaveBeenCalled();
    expect(mockPrisma.groupMessage.create).toHaveBeenCalledWith({
      data: { conversationId: "g1", senderId: "u1", body: "hello" },
    });
    expect(mockPrisma.groupMember.update).toHaveBeenCalledWith({
      where: { id: "mem1" },
      data: { lastReadAt: expect.any(Date) },
    });
    expect(result).toEqual({ id: "msg1", body: "hi" });
  });
});

describe("leaveGroup", () => {
  it("rejects leaving a group you're not a member of", async () => {
    mockPrisma.groupMember.findUnique.mockResolvedValue(null);

    await expect(leaveGroup("u1", "g1")).rejects.toThrow(SocialError);
  });

  it("deletes only the membership when other members remain", async () => {
    mockPrisma.groupMember.findUnique.mockResolvedValue({ id: "mem1" });
    mockPrisma.groupMember.count.mockResolvedValue(2);

    await leaveGroup("u1", "g1");

    expect(mockPrisma.groupMember.delete).toHaveBeenCalledWith({ where: { id: "mem1" } });
    expect(mockPrisma.groupConversation.delete).not.toHaveBeenCalled();
  });

  it("deletes the whole conversation once the last member leaves", async () => {
    mockPrisma.groupMember.findUnique.mockResolvedValue({ id: "mem1" });
    mockPrisma.groupMember.count.mockResolvedValue(0);

    await leaveGroup("u1", "g1");

    expect(mockPrisma.groupConversation.delete).toHaveBeenCalledWith({ where: { id: "g1" } });
  });
});

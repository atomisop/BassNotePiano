import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  groupMember: { findMany: vi.fn() },
  groupMessage: { findFirst: vi.fn(), count: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/notifications", () => ({ sendEmailIfEnabled: vi.fn() }));
vi.mock("@/lib/social", () => ({
  isFriend: vi.fn(),
  normalizeUsername: vi.fn(),
  SocialError: class SocialError extends Error {},
}));

import { getGroups, getTotalUnreadGroupMessageCount } from "./groupMessages";

function membership(overrides: Partial<{ lastReadAt: Date | null; joinedAt: Date }> = {}) {
  return {
    conversationId: "g1",
    lastReadAt: null,
    joinedAt: new Date("2026-01-01"),
    conversation: {
      id: "g1",
      name: "Study Group",
      createdAt: new Date("2026-01-01"),
      members: [
        { userId: "me", user: { id: "me", name: "Me", username: "me" } },
        { userId: "alice", user: { id: "alice", name: "Alice", username: "alice" } },
      ],
    },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getGroups", () => {
  it("excludes the caller's own name from memberNames", async () => {
    mockPrisma.groupMember.findMany.mockResolvedValue([membership()]);
    mockPrisma.groupMessage.findFirst.mockResolvedValue(null);
    mockPrisma.groupMessage.count.mockResolvedValue(0);

    const [group] = await getGroups("me");

    expect(group.memberNames).toEqual(["Alice"]);
  });

  it("falls back to @username when a member has no display name", async () => {
    mockPrisma.groupMember.findMany.mockResolvedValue([
      {
        ...membership(),
        conversation: {
          ...membership().conversation,
          members: [
            { userId: "me", user: { id: "me", name: "Me", username: "me" } },
            { userId: "alice", user: { id: "alice", name: null, username: "alice" } },
          ],
        },
      },
    ]);
    mockPrisma.groupMessage.findFirst.mockResolvedValue(null);
    mockPrisma.groupMessage.count.mockResolvedValue(0);

    const [group] = await getGroups("me");

    expect(group.memberNames).toEqual(["@alice"]);
  });

  it("counts unread messages sent after lastReadAt when the member has read before", async () => {
    const lastReadAt = new Date("2026-03-01");
    mockPrisma.groupMember.findMany.mockResolvedValue([membership({ lastReadAt })]);
    mockPrisma.groupMessage.findFirst.mockResolvedValue(null);
    mockPrisma.groupMessage.count.mockResolvedValue(2);

    await getGroups("me");

    expect(mockPrisma.groupMessage.count).toHaveBeenCalledWith({
      where: { conversationId: "g1", senderId: { not: "me" }, createdAt: { gt: lastReadAt } },
    });
  });

  it("falls back to joinedAt for the unread cutoff when the member has never read the group", async () => {
    const joinedAt = new Date("2026-02-01");
    mockPrisma.groupMember.findMany.mockResolvedValue([membership({ lastReadAt: null, joinedAt })]);
    mockPrisma.groupMessage.findFirst.mockResolvedValue(null);
    mockPrisma.groupMessage.count.mockResolvedValue(0);

    await getGroups("me");

    expect(mockPrisma.groupMessage.count).toHaveBeenCalledWith({
      where: { conversationId: "g1", senderId: { not: "me" }, createdAt: { gt: joinedAt } },
    });
  });

  it("uses the group's createdAt as lastMessageAt when no message has been sent yet", async () => {
    mockPrisma.groupMember.findMany.mockResolvedValue([membership()]);
    mockPrisma.groupMessage.findFirst.mockResolvedValue(null);
    mockPrisma.groupMessage.count.mockResolvedValue(0);

    const [group] = await getGroups("me");

    expect(group.lastMessageAt).toEqual(new Date("2026-01-01"));
    expect(group.lastMessageBody).toBeNull();
  });

  it("sorts groups by most recent activity first", async () => {
    mockPrisma.groupMember.findMany.mockResolvedValue([
      { ...membership(), conversationId: "g1", conversation: { ...membership().conversation, id: "g1" } },
      { ...membership(), conversationId: "g2", conversation: { ...membership().conversation, id: "g2" } },
    ]);
    mockPrisma.groupMessage.findFirst.mockImplementation(async ({ where }: { where: { conversationId: string } }) =>
      where.conversationId === "g1"
        ? { body: "old", createdAt: new Date("2026-01-01"), sender: { name: "A", username: "a" } }
        : { body: "new", createdAt: new Date("2026-06-01"), sender: { name: "B", username: "b" } },
    );
    mockPrisma.groupMessage.count.mockResolvedValue(0);

    const groups = await getGroups("me");

    expect(groups.map((g) => g.id)).toEqual(["g2", "g1"]);
  });
});

describe("getTotalUnreadGroupMessageCount", () => {
  it("sums unread counts across every group the user belongs to", async () => {
    mockPrisma.groupMember.findMany.mockResolvedValue([
      { conversationId: "g1", lastReadAt: null, joinedAt: new Date() },
      { conversationId: "g2", lastReadAt: null, joinedAt: new Date() },
    ]);
    mockPrisma.groupMessage.count.mockResolvedValueOnce(2).mockResolvedValueOnce(5);

    const total = await getTotalUnreadGroupMessageCount("me");

    expect(total).toBe(7);
  });

  it("is 0 when the user belongs to no groups", async () => {
    mockPrisma.groupMember.findMany.mockResolvedValue([]);

    expect(await getTotalUnreadGroupMessageCount("me")).toBe(0);
  });
});

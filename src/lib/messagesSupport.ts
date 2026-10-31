import { prisma } from "@/lib/prisma";
import { consumeRateLimit, RateLimitError } from "@/lib/rateLimit";
import { AssistantEscalationError, createAssistantEscalation, postVisitorMessage } from "@/lib/support";

/**
 * The "Support" conversation that lives at the top of everyone's Messages. It is NOT a separate system: it is the
 * signed-in person's own Support Chat thread (the same AssistantEscalation and SupportMessage rows Atom's handoff
 * uses), so the team answers it from Admin > Support Chat like any other, and the person can write without going
 * through Atom. Everything is scoped to the signed-in user's id, passed in by the server action from the session
 * and never from the request.
 */

export const MAX_SUPPORT_MESSAGE_LENGTH = 2000;
/** Messages one person can send: a burst limit and a daily limit, so the team's inbox cannot be flooded. */
const BURST = { windowMinutes: 10, max: 15, message: "You are sending messages very fast. Please wait a few minutes." };
const DAILY = { windowMinutes: 24 * 60, max: 100, message: "That is a lot of messages for one day. We will answer the ones you have sent." };

export interface SupportChatMessage {
  id: string;
  /** True for the person's own messages, false for the team's (and Atom's earlier replies). */
  mine: boolean;
  body: string;
  createdAt: string;
}

export interface SupportChat {
  messages: SupportChatMessage[];
  /** The team's replies the person has not opened yet. */
  unread: number;
  /** There is a conversation the team is still handling (a message sent now joins it instead of starting a new one). */
  open: boolean;
}

const readKey = (userId: string) => `support-read:${userId}`;

async function lastReadAt(userId: string): Promise<Date> {
  const row = await prisma.appSetting.findUnique({ where: { key: readKey(userId) } });
  const ms = row ? Number(row.value) : 0;
  return new Date(Number.isFinite(ms) ? ms : 0);
}

/** The person's whole support history, oldest first, one timeline. Team-only notes are never included. */
export async function getSupportChat(userId: string): Promise<SupportChat> {
  const [rows, readAt, openThread] = await Promise.all([
    prisma.supportMessage.findMany({
      where: { escalation: { userId, source: "CHAT" }, sender: { not: "INTERNAL" } },
      orderBy: { createdAt: "asc" },
      take: 500,
      select: { id: true, sender: true, body: true, createdAt: true },
    }),
    lastReadAt(userId),
    prisma.assistantEscalation.findFirst({ where: { userId, source: "CHAT", status: "OPEN" }, select: { id: true } }),
  ]);
  return {
    messages: rows.map((row) => ({ id: row.id, mine: row.sender === "VISITOR", body: row.body, createdAt: row.createdAt.toISOString() })),
    unread: rows.filter((row) => row.sender === "SUPPORT" && row.createdAt > readAt).length,
    open: Boolean(openThread),
  };
}

/** How many replies from the team are waiting, for the unread badge. Cheap enough to poll. */
export async function getSupportUnreadCount(userId: string): Promise<number> {
  const readAt = await lastReadAt(userId);
  return prisma.supportMessage.count({
    where: { escalation: { userId, source: "CHAT" }, sender: "SUPPORT", createdAt: { gt: readAt } },
  });
}

export async function markSupportChatRead(userId: string): Promise<void> {
  const value = String(Date.now());
  await prisma.appSetting.upsert({ where: { key: readKey(userId) }, update: { value }, create: { key: readKey(userId), value } });
}

/**
 * Sends one message to the team. It joins the person's open conversation, or starts a new one when the last was closed
 * (a closed conversation takes no new messages, but nothing here makes the person start over by hand).
 */
export async function sendSupportChatMessage(userId: string, rawBody: string): Promise<void> {
  const body = rawBody.trim();
  if (!body) throw new AssistantEscalationError("Write a message first.");
  if (body.length > MAX_SUPPORT_MESSAGE_LENGTH) throw new AssistantEscalationError(`Keep it under ${MAX_SUPPORT_MESSAGE_LENGTH} characters, or send it in two parts.`);

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, username: true, email: true, bannedAt: true } });
  if (!user) throw new AssistantEscalationError("Account not found.");
  if (user.bannedAt) throw new AssistantEscalationError("This account cannot send messages.");

  try {
    await consumeRateLimit(prisma, `support-chat:burst:${userId}`, BURST);
    await consumeRateLimit(prisma, `support-chat:day:${userId}`, DAILY);
  } catch (err) {
    if (err instanceof RateLimitError) throw new AssistantEscalationError(err.message);
    throw err;
  }

  const identifier = `user:${userId}`;
  const open = await prisma.assistantEscalation.findFirst({ where: { userId, source: "CHAT", status: "OPEN" }, orderBy: { createdAt: "desc" }, select: { id: true } });
  if (open) {
    const posted = await postVisitorMessage(open.id, identifier, body);
    if (!posted) throw new AssistantEscalationError("Could not send that. Reload and try again.");
    return;
  }

  const name = user.name ?? user.username ?? null;
  await createAssistantEscalation({
    identifier,
    userId,
    contactName: name,
    contactEmail: user.email,
    subject: "Messages",
    transcript: [{ role: "user", content: body }],
    notice: { title: `${name ?? user.email} sent a message`, body: `"${body.slice(0, 160)}"` },
  });
}

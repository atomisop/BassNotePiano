import { getAdminRecipients } from "@/lib/adminNotifications";
// The live support chat behind Atom's "connect me to a person" handoff (see
// AssistantWidget.tsx). An AssistantEscalation is the thread; SupportMessage
// rows are its timeline — seeded from the pre-escalation Atom transcript at
// handoff time, then appended to by the visitor and by whichever admin
// replies from /admin/support. This is the one place an Atom conversation is
// actually persisted server-side, since an anonymous visitor (the widget
// works with no account) has no Message history to point at at all.
//
// Two very different trust boundaries share this file:
//  - the visitor side (loadThreadForVisitor / postVisitorMessage) is reached
//    from a public API route with no login required for an anonymous
//    escalation — the escalation id itself is the bearer credential there,
//    same trust model as e.g. a presigned URL. A *signed-in* visitor's
//    escalation is additionally locked to their own session (see
//    loadThreadForVisitor) so holding the id alone isn't enough once an
//    account is attached.
//  - the admin side (getSupportThreads / getSupportThread / postAdminReply /
//    resolveSupportThread) always requires an ADMIN session, checked by the
//    caller (src/app/(dashboard)/admin/support/actions.ts) before any of
//    these run.

import { prisma } from "@/lib/prisma";
import type { AssistantEscalationStatus, SupportMessageSender } from "@prisma/client";
import { getServerAuthSession } from "@/lib/auth";
import { createNotification } from "@/lib/notifications";
import type { AssistantMessage } from "@/lib/assistant";

export class AssistantEscalationError extends Error {}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_TRANSCRIPT_MESSAGES = 20; // matches MAX_MESSAGES in the /api/assistant routes
const MAX_TRANSCRIPT_MESSAGE_LENGTH = 2000; // matches MAX_MESSAGE_LENGTH in the /api/assistant routes
const MAX_NAME_LENGTH = 200;
const MAX_VISITOR_MESSAGE_LENGTH = 2000;

function sanitizeTranscript(messages: AssistantMessage[]) {
  return messages
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-MAX_TRANSCRIPT_MESSAGES)
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_TRANSCRIPT_MESSAGE_LENGTH) }));
}

// ---------------------------------------------------------------------------
// Creating a handoff — the pre-escalation Atom transcript is seeded in as
// SupportMessage rows (VISITOR/ATOM) so the thread is one continuous
// timeline from the very first message onward, not a static snapshot
// bolted onto a separate live chat.
// ---------------------------------------------------------------------------

export interface CreateAssistantEscalationInput {
  /** Same `user:<id>` / IP convention used across the assistant routes — rate-limiting/abuse trail only. */
  identifier: string;
  userId: string | null;
  contactName: string | null;
  contactEmail: string;
  transcript: AssistantMessage[];
}

export async function createAssistantEscalation(input: CreateAssistantEscalationInput) {
  const contactEmail = input.contactEmail.trim().toLowerCase();
  if (!EMAIL_RE.test(contactEmail)) {
    throw new AssistantEscalationError("Enter a valid email address so our team can follow up.");
  }
  const contactName = input.contactName?.trim().slice(0, MAX_NAME_LENGTH) || null;

  const transcript = sanitizeTranscript(input.transcript);
  if (transcript.length === 0) {
    throw new AssistantEscalationError("Ask Atom something first. There's no conversation to hand off yet.");
  }

  const escalation = await prisma.assistantEscalation.create({
    data: {
      identifier: input.identifier,
      userId: input.userId,
      contactName,
      contactEmail,
      messages: {
        create: transcript.map((m) => ({
          sender: (m.role === "user" ? "VISITOR" : "ATOM") satisfies SupportMessageSender,
          body: m.content,
          identifier: m.role === "user" ? input.identifier : null,
        })),
      },
    },
  });

  const lastUserMessage = [...transcript].reverse().find((m) => m.role === "user");
  const whoLabel = contactName ? `${contactName} (${contactEmail})` : contactEmail;

  // Every admin sees a live handoff ping, so a co-instructor on the Employees
  // list is reachable the same way the owner is. Each admin's own email
  // preference still applies.
  const admins = await getAdminRecipients("SUPPORT_CHAT");
  await Promise.all(
    admins.map((admin) =>
      createNotification({
        userId: admin.id,
        type: "ASSISTANT_ESCALATION",
        title: "Atom handoff: someone needs a person",
        body: `${whoLabel} asked Atom to connect them with the team.${
          lastUserMessage ? ` Last question: "${lastUserMessage.content.slice(0, 160)}"` : ""
        }`,
        // Mirrors the other admin-facing lead notification (class
        // registrations): there's no dedicated "ops alerts" email category,
        // and this is the closest fit of the four that exist.
        emailCategory: "social",
      }),
    ),
  );

  return escalation;
}

// ---------------------------------------------------------------------------
// Visitor side — reachable with no login for an anonymous escalation. The
// shape returned deliberately omits sentById: nothing here ever tells the
// widget which admin (if any) sent a SUPPORT reply.
// ---------------------------------------------------------------------------

export interface ThreadMessageView {
  id: string;
  sender: SupportMessageSender;
  body: string;
  createdAt: Date;
}

export interface ThreadView {
  status: AssistantEscalationStatus;
  messages: ThreadMessageView[];
  /** The team is typing a reply right now. */
  supportTyping: boolean;
}

const THREAD_SELECT = {
  id: true,
  sender: true,
  body: true,
  createdAt: true,
} as const;

/**
 * Loads a thread for the visitor side, enforcing: a signed-in submitter's
 * escalation can only ever be read/posted to by that same signed-in
 * session; an anonymous escalation (no userId) trusts whoever holds the
 * unguessable id, the same way a presigned URL or an invite link would.
 * Returns null for "doesn't exist" and "forbidden" alike — a visitor-facing
 * 404 either way, so a wrong id can't be used to probe which ones exist.
 */
async function loadEscalationForVisitor(escalationId: string) {
  const escalation = await prisma.assistantEscalation.findUnique({ where: { id: escalationId } });
  if (!escalation) return null;

  if (escalation.userId) {
    const session = await getServerAuthSession();
    if (!session?.user?.id || session.user.id !== escalation.userId) return null;
  }

  return escalation;
}

export async function getThreadForVisitor(escalationId: string): Promise<ThreadView | null> {
  const escalation = await loadEscalationForVisitor(escalationId);
  if (!escalation) return null;

  const messages = await prisma.supportMessage.findMany({
    where: { escalationId },
    orderBy: { createdAt: "asc" },
    select: THREAD_SELECT,
  });

  return { status: escalation.status, messages, supportTyping: await isSideTyping(escalationId, "SUPPORT") };
}

export async function postVisitorMessage(
  escalationId: string,
  identifier: string,
  body: string,
): Promise<ThreadView | null> {
  const escalation = await loadEscalationForVisitor(escalationId);
  if (!escalation) return null;

  // Per direct instruction: once an admin resolves a thread, it's dead —
  // the history stays (nothing here deletes anything), but the thread no
  // longer accepts new messages from either side and nothing reopens it
  // automatically. A visitor who genuinely needs more help starts a fresh
  // Atom conversation instead, which can open its own new escalation.
  if (escalation.status === "RESOLVED") {
    throw new AssistantEscalationError("This conversation is closed. Start a new question with Atom if you need more help.");
  }

  const trimmed = body.trim().slice(0, MAX_VISITOR_MESSAGE_LENGTH);
  if (!trimmed) throw new AssistantEscalationError("Message can't be empty.");

  // Only the first message of a burst pings the admins, so a visitor typing
  // three lines in a row doesn't send three emails.
  const previous = await prisma.supportMessage.findFirst({
    where: { escalationId },
    orderBy: { createdAt: "desc" },
    select: { sender: true },
  });

  await prisma.supportMessage.create({
    data: { escalationId, sender: "VISITOR", body: trimmed, identifier },
  });
  await clearSupportTyping(escalationId, "VISITOR");

  if (previous?.sender !== "VISITOR") {
    const admins = await getAdminRecipients("SUPPORT_CHAT");
    await Promise.all(
      admins.map((admin) =>
        createNotification({
          userId: admin.id,
          type: "ASSISTANT_ESCALATION",
          title: "New message in Support Chat",
          body: `${escalation.contactName ?? escalation.contactEmail}: "${trimmed.slice(0, 160)}"`,
          emailCategory: "social",
        }).catch((err) => console.error("Support chat notification failed (non-blocking):", err)),
      ),
    );
  }

  return getThreadForVisitor(escalationId);
}

// ---------------------------------------------------------------------------
// Admin side — every export below assumes the caller (the server actions in
// admin/support/actions.ts) has already verified an ADMIN session. adminId
// is passed in explicitly rather than re-derived here, so this file never
// silently trusts a session on its own.
// ---------------------------------------------------------------------------

export interface AdminThreadSummary {
  id: string;
  contactName: string | null;
  contactEmail: string;
  status: AssistantEscalationStatus;
  createdAt: Date;
  user: { id: string; name: string | null; username: string | null } | null;
  resolvedByName: string | null;
  lastMessage: { sender: SupportMessageSender; body: string; createdAt: Date } | null;
  hasUnread: boolean;
}

/** `userId` narrows to one account's own threads — used by the admin
    customer-detail page; the plain admin support inbox never passes it. */
export async function getSupportThreads(status?: AssistantEscalationStatus, userId?: string): Promise<AdminThreadSummary[]> {
  const escalations = await prisma.assistantEscalation.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(userId ? { userId } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      user: { select: { id: true, name: true, username: true } },
      resolvedBy: { select: { name: true } },
      messages: { orderBy: { createdAt: "desc" }, take: 1, select: { sender: true, body: true, createdAt: true } },
    },
  });

  return escalations.map((e) => ({
    id: e.id,
    contactName: e.contactName,
    contactEmail: e.contactEmail,
    status: e.status,
    createdAt: e.createdAt,
    user: e.user,
    resolvedByName: e.resolvedBy?.name ?? null,
    lastMessage: e.messages[0] ?? null,
    hasUnread: Boolean(
      e.messages[0] && e.messages[0].sender === "VISITOR" && (!e.adminLastReadAt || e.messages[0].createdAt > e.adminLastReadAt),
    ),
  }));
}

export interface AdminThreadMessage extends ThreadMessageView {
  sentByName: string | null;
}

export async function getSupportThread(escalationId: string): Promise<{ status: AssistantEscalationStatus; messages: AdminThreadMessage[]; visitorTyping: boolean } | null> {
  const escalation = await prisma.assistantEscalation.findUnique({ where: { id: escalationId } });
  if (!escalation) return null;

  const [messages] = await Promise.all([
    prisma.supportMessage.findMany({
      where: { escalationId },
      orderBy: { createdAt: "asc" },
      select: { id: true, sender: true, body: true, createdAt: true, sentBy: { select: { name: true } } },
    }),
    // Opening the thread is what clears its unread state — a single shared
    // "an admin looked at this" marker, not per-admin.
    prisma.assistantEscalation.update({ where: { id: escalationId }, data: { adminLastReadAt: new Date() } }),
  ]);

  return {
    status: escalation.status,
    messages: messages.map((m) => ({ id: m.id, sender: m.sender, body: m.body, createdAt: m.createdAt, sentByName: m.sentBy?.name ?? null })),
    visitorTyping: await isSideTyping(escalationId, "VISITOR"),
  };
}

export async function postAdminReply(escalationId: string, adminId: string, body: string): Promise<void> {
  const trimmed = body.trim().slice(0, MAX_VISITOR_MESSAGE_LENGTH);
  if (!trimmed) throw new AssistantEscalationError("Message can't be empty.");

  await prisma.supportMessage.create({
    data: { escalationId, sender: "SUPPORT", body: trimmed, sentById: adminId },
  });
  await clearSupportTyping(escalationId, "SUPPORT");
  // Replying is itself "an admin looked at this."
  await prisma.assistantEscalation.update({ where: { id: escalationId }, data: { adminLastReadAt: new Date() } });
}

export async function resolveSupportThread(escalationId: string, adminId: string): Promise<void> {
  await prisma.assistantEscalation.updateMany({
    where: { id: escalationId, status: "OPEN" },
    data: { status: "RESOLVED", resolvedAt: new Date(), resolvedById: adminId },
  });
}

// Permanently erases everything a visitor shared through this one thread:
// the escalation row itself (contactName/contactEmail) and, via the schema's
// `onDelete: Cascade` on SupportMessage.escalation, every message body in
// it. Deliberately does NOT touch the linked User row when the visitor was
// signed in — that's a real account, out of scope for "delete this chat."
// `deleteMany` (not `delete`) so calling this twice, or on an id that's
// already gone, is a no-op instead of throwing.
export async function deleteSupportThread(escalationId: string): Promise<void> {
  await prisma.assistantEscalation.deleteMany({ where: { id: escalationId } });
}

// ---------------------------------------------------------------------------
// Typing: shown to the other side while a message is being written
// ---------------------------------------------------------------------------

// Same staleness window as direct-message typing: the composer re-pings a little inside it.
const SUPPORT_TYPING_STALE_MS = 8_000;

/** Called while someone writes in a thread. The customer is VISITOR, the team is SUPPORT. */
export async function setSupportTyping(escalationId: string, side: "VISITOR" | "SUPPORT", typing = true): Promise<void> {
  if (!typing) {
    await clearSupportTyping(escalationId, side);
    return;
  }
  const exists = await prisma.assistantEscalation.findUnique({ where: { id: escalationId }, select: { id: true } });
  if (!exists) return;
  await prisma.supportTypingStatus.upsert({
    where: { escalationId_side: { escalationId, side } },
    // Explicit: an empty update does not touch @updatedAt, and recency is the signal.
    update: { updatedAt: new Date() },
    create: { escalationId, side },
  });
}

export async function isSideTyping(escalationId: string, side: "VISITOR" | "SUPPORT"): Promise<boolean> {
  const row = await prisma.supportTypingStatus.findUnique({ where: { escalationId_side: { escalationId, side } }, select: { updatedAt: true } });
  return !!row && Date.now() - row.updatedAt.getTime() < SUPPORT_TYPING_STALE_MS;
}

/** A sent message ends that side's typing straight away. */
export async function clearSupportTyping(escalationId: string, side: "VISITOR" | "SUPPORT"): Promise<void> {
  await prisma.supportTypingStatus.deleteMany({ where: { escalationId, side } });
}

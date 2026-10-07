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

import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import type { AssistantEscalationStatus, SupportMessageSender, SupportThreadSource } from "@prisma/client";
import { getServerAuthSession } from "@/lib/auth";
import { createNotification } from "@/lib/notifications";
import { sendSupportEmailReply } from "@/lib/email";
import { normalizeSubject, replySubject } from "@/lib/inboundEmail";
import { adminLabel, matchAdminToken, type MentionableAdmin } from "@/lib/supportCommands";
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
  /** What the case is about ("Booking"), shown in the admin list and header. */
  subject?: string;
  /** Replaces the default "Atom handoff" admin notification text. */
  notice?: { title: string; body: string };
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
      subject: input.subject?.trim().slice(0, 200) || null,
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
        title: input.notice?.title ?? `Atom handoff: ${contactName ?? "someone"} needs a person`,
        body:
          input.notice?.body ??
          `${whoLabel} asked Atom to connect them with the team.${
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

/**
 * Opens (or reuses) a support case with a subject, under the signed-in
 * student's real name, seeded with one line of context and the student's
 * request. While the student already has an open case with this subject, it is
 * returned and the new context line is added once, instead of a second case.
 */
export async function openSubjectSupportCase(
  userId: string,
  input: { subject: string; contextLine: string; request: string; noticeTitle: (name: string) => string; noticeBody: string },
): Promise<{ escalationId: string }> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, username: true, email: true } });
  if (!user) throw new AssistantEscalationError("Account not found.");

  const existing = await prisma.assistantEscalation.findFirst({
    where: { userId, source: "CHAT", status: "OPEN", subject: input.subject },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  if (existing) {
    const alreadyMentioned = await prisma.supportMessage.findFirst({
      where: { escalationId: existing.id, body: { contains: input.contextLine } },
      select: { id: true },
    });
    if (!alreadyMentioned) {
      await prisma.supportMessage.create({
        data: { escalationId: existing.id, sender: "VISITOR", body: input.request, identifier: `user:${userId}` },
      });
    }
    return { escalationId: existing.id };
  }

  const name = user.name ?? user.username ?? null;
  const escalation = await createAssistantEscalation({
    identifier: `user:${userId}`,
    userId,
    contactName: name,
    contactEmail: user.email,
    subject: input.subject,
    transcript: [
      { role: "assistant", content: `${input.subject} details: ${input.contextLine}.` },
      { role: "user", content: input.request },
    ],
    notice: { title: input.noticeTitle(name ?? user.email), body: input.noticeBody },
  });
  return { escalationId: escalation.id };
}

/**
 * "Message support" on a booked class: a case with the subject "Booking",
 * seeded with the class so the team knows which one.
 */
export async function openBookingSupportCase(userId: string, bookingId: string): Promise<{ escalationId: string }> {
  const booking = await prisma.classBooking.findFirst({
    where: { id: bookingId, studentId: userId },
    include: { schedule: { select: { label: true } } },
  });
  if (!booking) throw new AssistantEscalationError("That class doesn't exist.");
  const when = booking.scheduledAt.toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "full", timeStyle: "short" });
  const classLine = `${booking.schedule.label ?? "Class"}, ${when} ET`;
  return openSubjectSupportCase(userId, {
    subject: "Booking",
    contextLine: classLine,
    request: `I need help with my booking: ${classLine}.`,
    noticeTitle: (name) => `${name} needs help with a booking`,
    noticeBody: `${classLine}.`,
  });
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
  // An email thread belongs to the customer's inbox, not the chat widget.
  if (!escalation || escalation.source !== "CHAT") return null;

  if (escalation.userId) {
    const session = await getServerAuthSession();
    if (!session?.user?.id || session.user.id !== escalation.userId) return null;
  }

  return escalation;
}

export async function getThreadForVisitor(escalationId: string): Promise<ThreadView | null> {
  const escalation = await loadEscalationForVisitor(escalationId);
  if (!escalation) return null;

  // INTERNAL notes are between admins. They are filtered here, in the one
  // read the customer-facing routes use, so no caller can leak one by accident.
  const messages = await prisma.supportMessage.findMany({
    where: { escalationId, sender: { not: "INTERNAL" } },
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
    where: { escalationId, sender: { not: "INTERNAL" } },
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
  source: SupportThreadSource;
  subject: string | null;
  createdAt: Date;
  user: { id: string; name: string | null; username: string | null } | null;
  assignedTo: { id: string; name: string | null } | null;
  resolvedByName: string | null;
  lastMessage: { sender: SupportMessageSender; body: string; createdAt: Date } | null;
  hasUnread: boolean;
}

/** `userId` narrows to one account's own threads — used by the admin
    customer-detail page; the plain admin support inbox never passes it. */
export async function getSupportThreads(
  status?: AssistantEscalationStatus,
  userId?: string,
  source?: SupportThreadSource,
  assignedToId?: string,
): Promise<AdminThreadSummary[]> {
  const escalations = await prisma.assistantEscalation.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(userId ? { userId } : {}),
      ...(source ? { source } : {}),
      ...(assignedToId ? { assignedToId } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      user: { select: { id: true, name: true, username: true } },
      assignedTo: { select: { id: true, name: true } },
      resolvedBy: { select: { name: true } },
      // The preview and the unread dot follow the conversation, not the notes between admins.
      messages: {
        where: { sender: { not: "INTERNAL" } },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { sender: true, body: true, createdAt: true },
      },
    },
  });

  return escalations.map((e) => ({
    id: e.id,
    contactName: e.contactName,
    contactEmail: e.contactEmail,
    status: e.status,
    source: e.source,
    subject: e.subject,
    createdAt: e.createdAt,
    user: e.user,
    assignedTo: e.assignedTo,
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

export interface AdminThreadMeta {
  id: string;
  contactName: string | null;
  contactEmail: string;
  source: SupportThreadSource;
  subject: string | null;
  status: AssistantEscalationStatus;
  user: { id: string; name: string | null; username: string | null } | null;
  assignedTo: { id: string; name: string | null } | null;
}

export interface AdminThreadDetail {
  thread: AdminThreadMeta;
  status: AssistantEscalationStatus;
  messages: AdminThreadMessage[];
  visitorTyping: boolean;
}

export async function getSupportThread(escalationId: string): Promise<AdminThreadDetail | null> {
  const escalation = await prisma.assistantEscalation.findUnique({
    where: { id: escalationId },
    include: {
      user: { select: { id: true, name: true, username: true } },
      assignedTo: { select: { id: true, name: true } },
    },
  });
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
    thread: {
      id: escalation.id,
      contactName: escalation.contactName,
      contactEmail: escalation.contactEmail,
      source: escalation.source,
      subject: escalation.subject,
      status: escalation.status,
      user: escalation.user,
      assignedTo: escalation.assignedTo,
    },
    status: escalation.status,
    messages: messages.map((m) => ({ id: m.id, sender: m.sender, body: m.body, createdAt: m.createdAt, sentByName: m.sentBy?.name ?? null })),
    visitorTyping: await isSideTyping(escalationId, "VISITOR"),
  };
}

const MAX_EMAIL_REPLY_LENGTH = 5000;

export async function postAdminReply(escalationId: string, adminId: string, body: string): Promise<void> {
  const escalation = await prisma.assistantEscalation.findUnique({
    where: { id: escalationId },
    select: { source: true, contactEmail: true, subject: true },
  });
  if (!escalation) throw new AssistantEscalationError("That conversation no longer exists.");

  if (escalation.source === "EMAIL") {
    await postEmailReply(escalationId, adminId, body, escalation);
    return;
  }

  const trimmed = body.trim().slice(0, MAX_VISITOR_MESSAGE_LENGTH);
  if (!trimmed) throw new AssistantEscalationError("Message can't be empty.");

  await prisma.supportMessage.create({
    data: { escalationId, sender: "SUPPORT", body: trimmed, sentById: adminId },
  });
  await clearSupportTyping(escalationId, "SUPPORT");
  // Replying is itself "an admin looked at this."
  await prisma.assistantEscalation.update({ where: { id: escalationId }, data: { adminLastReadAt: new Date() } });
}

/** Emails the reply from music@ first and only then records it, so the thread never shows a reply the customer did not get. */
async function postEmailReply(
  escalationId: string,
  adminId: string,
  body: string,
  escalation: { contactEmail: string; subject: string | null },
): Promise<void> {
  const trimmed = body.trim().slice(0, MAX_EMAIL_REPLY_LENGTH);
  if (!trimmed) throw new AssistantEscalationError("Message can't be empty.");

  const earlier = await prisma.supportMessage.findMany({
    where: { escalationId, emailMessageId: { not: null } },
    orderBy: { createdAt: "asc" },
    select: { emailMessageId: true },
  });
  const references = earlier.map((m) => m.emailMessageId).filter((id): id is string => Boolean(id));
  const messageId = `<support-${randomUUID()}@bassnotepiano.com>`;

  try {
    await sendSupportEmailReply({
      to: escalation.contactEmail,
      subject: replySubject(escalation.subject),
      text: trimmed,
      messageId,
      inReplyTo: references[references.length - 1] ?? null,
      references: references.slice(-10),
    });
  } catch (err) {
    console.error("Support email reply failed:", err);
    throw new AssistantEscalationError("The email could not be sent. Nothing was delivered, so try again in a moment.");
  }

  await prisma.supportMessage.create({
    data: { escalationId, sender: "SUPPORT", body: trimmed, sentById: adminId, emailMessageId: messageId },
  });
  await prisma.assistantEscalation.update({ where: { id: escalationId }, data: { adminLastReadAt: new Date() } });
}

export async function listMentionableAdmins(): Promise<MentionableAdmin[]> {
  return prisma.user.findMany({
    where: { role: "ADMIN" },
    select: { id: true, name: true, username: true, email: true },
    orderBy: [{ name: "asc" }, { email: "asc" }],
  });
}

const MAX_TRANSFER_NOTE_LENGTH = 1000;

/**
 * "/isaac please look" in the reply box. Nothing goes to the customer: it
 * records an INTERNAL note, assigns the case to that admin (or to nobody for
 * /admin) and sends the admin a notification. Admin only, like every export
 * in this section.
 */
export async function transferSupportThread(input: {
  escalationId: string;
  fromAdminId: string;
  token: string;
  note: string;
}): Promise<{ label: string }> {
  const { escalationId, fromAdminId, token } = input;
  const note = input.note.trim().slice(0, MAX_TRANSFER_NOTE_LENGTH);

  const [escalation, admins] = await Promise.all([
    prisma.assistantEscalation.findUnique({
      where: { id: escalationId },
      select: { id: true, contactName: true, contactEmail: true, subject: true, source: true },
    }),
    listMentionableAdmins(),
  ]);
  if (!escalation) throw new AssistantEscalationError("That conversation no longer exists.");
  const sender = admins.find((a) => a.id === fromAdminId);
  if (!sender) throw new AssistantEscalationError("Only admins can transfer a case.");

  const match = matchAdminToken(token, admins);
  if (match.kind === "none") {
    throw new AssistantEscalationError(`No admin matches /${token}. Use /admin to notify everyone, or start your reply with a word to send it to the customer.`);
  }
  if (match.kind === "ambiguous") {
    throw new AssistantEscalationError(
      `More than one admin matches /${token}: ${match.candidates.map(adminLabel).join(", ")}. Type more of the name.`,
    );
  }

  let targets: MentionableAdmin[];
  let assignedToId: string | null;
  let label: string;
  if (match.kind === "all") {
    targets = admins.filter((a) => a.id !== fromAdminId);
    assignedToId = null;
    label = "all admins";
    if (targets.length === 0) throw new AssistantEscalationError("There is no other admin to notify.");
  } else {
    if (match.admin.id === fromAdminId) throw new AssistantEscalationError("That's you. Pick another admin.");
    targets = [match.admin];
    assignedToId = match.admin.id;
    label = adminLabel(match.admin);
  }

  await prisma.supportMessage.create({
    data: {
      escalationId,
      sender: "INTERNAL",
      body: note ? `Transferred to ${label}: ${note}` : `Transferred to ${label}.`,
      sentById: fromAdminId,
    },
  });
  // Back to unread, so the case stands out in the list for whoever it was sent to.
  await prisma.assistantEscalation.update({ where: { id: escalationId }, data: { assignedToId, adminLastReadAt: null } });

  const who = escalation.source === "EMAIL" ? escalation.subject || escalation.contactEmail : escalation.contactName || escalation.contactEmail;
  await Promise.all(
    targets.map((admin) =>
      createNotification({
        userId: admin.id,
        type: "SUPPORT_TRANSFER",
        title: match.kind === "all" ? "Case escalated to all admins" : "A case was transferred to you",
        body: `${adminLabel(sender)} sent you "${who}".${note ? ` Note: ${note.slice(0, 160)}` : ""}`,
      }).catch((err) => console.error("Support transfer notification failed (non-blocking):", err)),
    ),
  );

  return { label };
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
// Inbound email — a message to music@bassnotepiano.com, handed over by the
// Mailgun route (src/app/api/inbound/mailgun/route.ts). Each conversation is
// one EMAIL thread in the same tables as the chat, shown in the Email tab.
// ---------------------------------------------------------------------------

const MAX_EMAIL_BODY_LENGTH = 20_000;
const MAX_SUBJECT_LENGTH = 200;

export interface InboundEmail {
  /** The email's own Message-ID header; null only if the sender's mail server left it out. */
  messageId: string | null;
  fromEmail: string;
  fromName: string | null;
  /** Mailgun says the sender passed DKIM or SPF. Only then is the thread linked to an account with that email. */
  senderVerified: boolean;
  subject: string;
  text: string;
  /** Message-IDs from In-Reply-To then References, used to find the thread this answers. */
  parentMessageIds: string[];
  attachmentCount: number;
}

export type InboundOutcome = "created" | "appended" | "duplicate";

export async function ingestInboundEmail(mail: InboundEmail): Promise<{ outcome: InboundOutcome; escalationId: string | null }> {
  const emailMessageId = mail.messageId?.slice(0, 300) || `<inbound-${randomUUID()}@bassnotepiano.com>`;

  const seen = await prisma.supportMessage.findUnique({ where: { emailMessageId }, select: { escalationId: true } });
  if (seen) return { outcome: "duplicate", escalationId: seen.escalationId };

  const subject = mail.subject.trim().slice(0, MAX_SUBJECT_LENGTH) || "(no subject)";
  let body = mail.text.trim().slice(0, MAX_EMAIL_BODY_LENGTH) || "(no text)";
  if (mail.attachmentCount > 0) {
    body += `\n\n[${mail.attachmentCount} attachment${mail.attachmentCount === 1 ? "" : "s"} not shown here. Open the original in Gmail.]`;
  }
  const identifier = `email:${mail.fromEmail}`;

  // 1) Answers one of our own emails or an earlier message: same thread.
  let threadId: string | null = null;
  if (mail.parentMessageIds.length > 0) {
    const parent = await prisma.supportMessage.findFirst({
      where: { emailMessageId: { in: mail.parentMessageIds }, escalation: { source: "EMAIL" } },
      select: { escalationId: true },
    });
    threadId = parent?.escalationId ?? null;
  }
  // 2) Mail clients that drop the reply headers: same sender and same subject.
  if (!threadId) {
    const recent = await prisma.assistantEscalation.findMany({
      where: { source: "EMAIL", contactEmail: mail.fromEmail },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, subject: true },
    });
    const wanted = normalizeSubject(subject);
    threadId = recent.find((t) => normalizeSubject(t.subject ?? "") === wanted)?.id ?? null;
  }

  const whoLabel = mail.fromName ? `${mail.fromName} (${mail.fromEmail})` : mail.fromEmail;
  let escalationId: string;
  let outcome: InboundOutcome;
  let notify = true;

  try {
    if (threadId) {
      const previous = await prisma.supportMessage.findFirst({
        where: { escalationId: threadId, sender: { not: "INTERNAL" } },
        orderBy: { createdAt: "desc" },
        select: { sender: true },
      });
      await prisma.supportMessage.create({
        data: { escalationId: threadId, sender: "VISITOR", body, identifier, emailMessageId },
      });
      // A customer writing again reopens a thread that was marked resolved.
      await prisma.assistantEscalation.updateMany({
        where: { id: threadId, status: "RESOLVED" },
        data: { status: "OPEN", resolvedAt: null, resolvedById: null },
      });
      escalationId = threadId;
      outcome = "appended";
      notify = previous?.sender !== "VISITOR";
    } else {
      // A From address anyone can forge must not attach a thread to a real account.
      const account = mail.senderVerified
        ? await prisma.user.findFirst({ where: { email: { equals: mail.fromEmail, mode: "insensitive" } }, select: { id: true } })
        : null;
      const created = await prisma.assistantEscalation.create({
        data: {
          identifier,
          userId: account?.id ?? null,
          contactName: mail.fromName,
          contactEmail: mail.fromEmail,
          source: "EMAIL",
          subject,
          messages: { create: { sender: "VISITOR", body, identifier, emailMessageId } },
        },
      });
      escalationId = created.id;
      outcome = "created";
    }
  } catch (err) {
    // The same email delivered twice at once: the unique Message-ID already won.
    if ((err as { code?: string })?.code === "P2002") return { outcome: "duplicate", escalationId: null };
    throw err;
  }

  if (notify) {
    const admins = await getAdminRecipients("MUSIC_INBOX");
    await Promise.all(
      admins.map((admin) =>
        createNotification({
          userId: admin.id,
          type: "ASSISTANT_ESCALATION",
          title: outcome === "created" ? "New email to music@" : "New reply by email",
          body: `${whoLabel}: ${subject}`,
          cta: { label: "Open Email", path: "/admin/support?source=email" },
        }).catch((err) => console.error("Inbound email notification failed (non-blocking):", err)),
      ),
    );
  }

  return { outcome, escalationId };
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

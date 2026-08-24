// The "connect me to a person" handoff from Atom's guided triage (see
// AssistantWidget.tsx) — created once a visitor confirms they still need a
// human after Atom couldn't resolve it. This is the one place an Atom
// conversation is actually persisted server-side: a self-contained
// transcript snapshot, not a pointer into the 1-on-1 Message model, since an
// anonymous visitor (the widget works with no account) has no Message
// history to point at at all. Every admin gets notified — see
// createAssistantEscalation below — and /admin/assistant is where the
// notification leads, showing that transcript in full.

import { prisma } from "@/lib/prisma";
import type { AssistantEscalationStatus } from "@prisma/client";
import { createNotification } from "@/lib/notifications";
import type { AssistantMessage } from "@/lib/assistant";

export class AssistantEscalationError extends Error {}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_TRANSCRIPT_MESSAGES = 20; // matches MAX_MESSAGES in the /api/assistant routes
const MAX_TRANSCRIPT_MESSAGE_LENGTH = 2000; // matches MAX_MESSAGE_LENGTH in the /api/assistant routes
const MAX_NAME_LENGTH = 200;

export interface CreateAssistantEscalationInput {
  /** Same `user:<id>` / IP convention used across the assistant routes — rate-limiting/abuse trail only. */
  identifier: string;
  userId: string | null;
  contactName: string | null;
  contactEmail: string;
  transcript: AssistantMessage[];
}

function sanitizeTranscript(messages: AssistantMessage[]) {
  return messages
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-MAX_TRANSCRIPT_MESSAGES)
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_TRANSCRIPT_MESSAGE_LENGTH) }));
}

export async function createAssistantEscalation(input: CreateAssistantEscalationInput) {
  const contactEmail = input.contactEmail.trim().toLowerCase();
  if (!EMAIL_RE.test(contactEmail)) {
    throw new AssistantEscalationError("Enter a valid email address so our team can follow up.");
  }
  const contactName = input.contactName?.trim().slice(0, MAX_NAME_LENGTH) || null;

  const transcript = sanitizeTranscript(input.transcript);
  if (transcript.length === 0) {
    throw new AssistantEscalationError("Ask Atom something first — there's no conversation to hand off yet.");
  }

  const escalation = await prisma.assistantEscalation.create({
    data: {
      identifier: input.identifier,
      userId: input.userId,
      contactName,
      contactEmail,
      transcript,
    },
  });

  const lastUserMessage = [...transcript].reverse().find((m) => m.role === "user");
  const whoLabel = contactName ? `${contactName} (${contactEmail})` : contactEmail;

  const admins = await prisma.user.findMany({ where: { role: "ADMIN" }, select: { id: true } });
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
        // registrations) — there's no dedicated "ops alerts" email
        // category, and this is the closest fit of the four that exist.
        emailCategory: "social",
      }),
    ),
  );

  return escalation;
}

export async function getAssistantEscalations(status?: AssistantEscalationStatus) {
  return prisma.assistantEscalation.findMany({
    where: status ? { status } : undefined,
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      user: { select: { id: true, name: true, email: true, image: true, username: true } },
      resolvedBy: { select: { name: true } },
    },
  });
}

export type AdminAssistantEscalation = Awaited<ReturnType<typeof getAssistantEscalations>>[number];

export async function resolveAssistantEscalation(escalationId: string, adminId: string): Promise<void> {
  await prisma.assistantEscalation.updateMany({
    where: { id: escalationId, status: "OPEN" },
    data: { status: "RESOLVED", resolvedAt: new Date(), resolvedById: adminId },
  });
}

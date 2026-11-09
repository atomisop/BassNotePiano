import type { PaymentPlanTerm, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { checkFamilyMember } from "@/lib/familyMemberCheck";
import { createNotification } from "@/lib/notifications";
import { answerHref } from "@/lib/bellAnswers";

/** An invitation (and an acceptance) counts for this long; after that the payer asks again. */
export const FAMILY_INVITE_DAYS = 7;
/** Someone who declined is not asked again by the same person for this long. */
export const FAMILY_INVITE_DECLINE_DAYS = 30;
/** A waiting invitation is not re-announced to the invitee more often than this. */
const RENOTIFY_MS = 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export type InviteState = "PENDING" | "ACCEPTED" | "DECLINED";

export class FamilyInviteError extends Error {}

const PLAN_TERMS: readonly PaymentPlanTerm[] = ["MONTHLY", "TERM_3", "TERM_6", "TERM_12"];

/** A plan length sent by the browser, or null when it is not one. */
export function parsePlanTerm(value: unknown): PaymentPlanTerm | null {
  return typeof value === "string" && (PLAN_TERMS as readonly string[]).includes(value) ? (value as PaymentPlanTerm) : null;
}

/** Where "they accepted" sends the payer: the group plan form, on the plan length they had picked when they invited. */
export function acceptedInviteHref(term: PaymentPlanTerm | null): string {
  return term ? `/billing/plans?who=family&term=${term}` : "/billing/plans?who=family";
}

export function inviteIsFresh(createdAt: Date, now = Date.now()): boolean {
  return now - createdAt.getTime() < FAMILY_INVITE_DAYS * DAY_MS;
}

function nameOf(u: { name: string | null; email: string }) {
  return u.name ?? u.email;
}

/** Invites the payer has out, newest answer per person, expired ones left out. Keyed by email because that is what the payer typed. */
export async function listInvitesFromPayer(payerId: string): Promise<{ email: string; status: InviteState }[]> {
  const rows = await prisma.familyInvite.findMany({
    where: { payerId, createdAt: { gt: new Date(Date.now() - FAMILY_INVITE_DAYS * DAY_MS) } },
    include: { invitee: { select: { email: true } } },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((r) => ({ email: r.invitee.email.toLowerCase(), status: r.status }));
}

/** Waiting invitations addressed to this person, with who sent each. */
export async function listInvitesForPerson(userId: string) {
  const rows = await prisma.familyInvite.findMany({
    where: { inviteeId: userId, status: "PENDING", createdAt: { gt: new Date(Date.now() - FAMILY_INVITE_DAYS * DAY_MS) } },
    include: { payer: { select: { name: true, email: true } } },
    orderBy: { createdAt: "desc" },
    take: 10,
  });
  return rows.map((r) => ({ id: r.id, payerName: nameOf(r.payer), createdAt: r.createdAt }));
}

/**
 * Asks an existing account to join the payer's group plan. Nothing is created for them until they say yes. `term` is the plan length the
 * payer has picked on the form, kept so their "accepted" notice can open the form on it again.
 */
export async function sendFamilyInvite(payerId: string, rawEmail: string, options: { term?: PaymentPlanTerm | null } = {}): Promise<InviteState> {
  const email = rawEmail.trim().toLowerCase();
  const check = await checkFamilyMember(payerId, email);
  if (check === "self") throw new FamilyInviteError("That is your own account. You are already included.");
  if (check === "invalid") throw new FamilyInviteError("That does not look like an email yet.");
  if (check === "no_account") throw new FamilyInviteError("No account with this email. They need to register first.");
  if (check === "needs_name") throw new FamilyInviteError("This account needs a first and last name before it can join.");

  const [payer, invitee] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: payerId }, select: { name: true, email: true } }),
    prisma.user.findUniqueOrThrow({ where: { email }, select: { id: true } }),
  ]);
  const existing = await prisma.familyInvite.findUnique({ where: { payerId_inviteeId: { payerId, inviteeId: invitee.id } } });
  const now = Date.now();
  const term = options.term ?? null;

  if (existing?.status === "DECLINED" && existing.respondedAt && now - existing.respondedAt.getTime() < FAMILY_INVITE_DECLINE_DAYS * DAY_MS) {
    return "DECLINED";
  }
  if (existing?.status === "ACCEPTED" && inviteIsFresh(existing.createdAt, now)) return "ACCEPTED";
  if (existing?.status === "PENDING" && inviteIsFresh(existing.createdAt, now) && now - existing.createdAt.getTime() < RENOTIFY_MS) {
    // Not announced again, but a changed plan length is still remembered for the "accepted" notice.
    if (term && existing.term !== term) await prisma.familyInvite.update({ where: { id: existing.id }, data: { term } });
    return "PENDING";
  }

  const invite = await prisma.familyInvite.upsert({
    where: { payerId_inviteeId: { payerId, inviteeId: invitee.id } },
    create: { payerId, inviteeId: invitee.id, status: "PENDING", term },
    update: { status: "PENDING", createdAt: new Date(), respondedAt: null, term },
  });
  // In the bell with Accept and Decline on it (bellAnswers.ts); the email's button opens Billing > Plans, where the same answer works.
  await createNotification({
    userId: invitee.id,
    type: "GROUP_INVITE",
    title: "You were invited to a group plan",
    body: `${nameOf(payer)} would like you on their group plan. Nothing starts for you unless you accept. They pay for your classes, you pick your own class times with your credits, and credits expire at the end of each 28-day cycle.`,
    emailCategory: "payments",
    href: answerHref("/billing/plans", invite.id),
  }).catch((err) => console.error("Group invitation notice failed (non-blocking):", err));
  return "PENDING";
}

/** The invitee's answer. Only their own, still-waiting invitation can be answered. */
export async function respondToFamilyInvite(userId: string, inviteId: string, accept: boolean): Promise<void> {
  const invite = await prisma.familyInvite.findUnique({ where: { id: inviteId } });
  if (!invite || invite.inviteeId !== userId || invite.status !== "PENDING" || !inviteIsFresh(invite.createdAt)) {
    throw new FamilyInviteError("That invitation is no longer waiting.");
  }
  const claimed = await prisma.familyInvite.updateMany({
    where: { id: inviteId, status: "PENDING" },
    data: accept ? { status: "ACCEPTED", respondedAt: new Date(), createdAt: new Date() } : { status: "DECLINED", respondedAt: new Date() },
  });
  if (claimed.count === 0) throw new FamilyInviteError("That invitation is no longer waiting.");
  if (accept) {
    const me = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { name: true, email: true } });
    // Opens the group plan form on the length the payer had picked, so they pick up where they left off.
    await createNotification({
      userId: invite.payerId,
      type: "PAYMENT_PLAN_UPDATED",
      title: "Group invitation accepted",
      body: `${nameOf(me)} accepted your group invitation. When everyone has accepted, pick the weekly time and start the plan.`,
      emailCategory: "payments",
      cta: { label: "Pick the time and start", path: acceptedInviteHref(invite.term) },
    }).catch((err) => console.error("Invitation accepted notice failed (non-blocking):", err));
  }
}

/** The payer withdraws a waiting or accepted invitation (removed the row, or changed their mind). */
export async function cancelFamilyInvite(payerId: string, rawEmail: string): Promise<void> {
  const email = rawEmail.trim().toLowerCase();
  await prisma.familyInvite.deleteMany({ where: { payerId, invitee: { email }, status: { not: "DECLINED" } } });
}

/** Inside the family-start transaction: every member except the payer must have said yes, recently, to THIS payer. */
export async function assertEveryoneAccepted(tx: Prisma.TransactionClient, payerId: string, others: { id: string; name: string | null; email: string }[]): Promise<void> {
  if (others.length === 0) return;
  const accepted = await tx.familyInvite.findMany({
    where: { payerId, inviteeId: { in: others.map((o) => o.id) }, status: "ACCEPTED", createdAt: { gt: new Date(Date.now() - FAMILY_INVITE_DAYS * DAY_MS) } },
    select: { inviteeId: true },
  });
  const yes = new Set(accepted.map((a) => a.inviteeId));
  const waiting = others.filter((o) => !yes.has(o.id));
  if (waiting.length > 0) throw new FamilyInviteError("Everyone must accept their invitation first. Send the invitations, then start the plan once they have accepted.");
}

/** Once the group exists the invitations are spent: starting a second family needs fresh yeses. */
export async function spendInvites(tx: Prisma.TransactionClient, payerId: string, otherIds: string[]): Promise<void> {
  if (otherIds.length > 0) await tx.familyInvite.deleteMany({ where: { payerId, inviteeId: { in: otherIds } } });
}

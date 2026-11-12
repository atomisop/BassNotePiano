import { prisma } from "@/lib/prisma";
import { claimScholarshipCode, ScholarshipError } from "@/lib/scholarships";
import { scholarshipPercentsFor } from "@/lib/scholarshipPercents";
import { FAMILY_INVITE_DAYS } from "@/lib/familyInvites";

// A scholarship on a group or parent plan belongs to ONE PERSON on it (their share of the price, see groupShares.ts), so it is the
// person's own account that holds it, exactly as on a solo plan. What is new is WHO may type the code: the payer, on that person's
// row. That is allowed only for someone who has already said yes to THIS payer (an accepted group invitation, or an accepted parent
// link), and the code must still have been made for that person's own email. Nothing else about claiming changes.

const DAY_MS = 86_400_000;

/** The person a payer may type a scholarship code for: an account that accepted this payer's group invitation (still fresh) or parent link. */
export async function acceptedMemberOf(payerId: string, rawEmail: string): Promise<{ id: string; email: string; name: string | null } | null> {
  const email = rawEmail.trim().toLowerCase();
  if (!email) return null;
  const member = await prisma.user.findFirst({ where: { email: { equals: email, mode: "insensitive" }, role: "STUDENT", bannedAt: null }, select: { id: true, email: true, name: true } });
  if (!member || member.id === payerId) return null;
  const [invite, link] = await Promise.all([
    prisma.familyInvite.findFirst({ where: { payerId, inviteeId: member.id, status: "ACCEPTED", createdAt: { gt: new Date(Date.now() - FAMILY_INVITE_DAYS * DAY_MS) } }, select: { id: true } }),
    prisma.parentLink.findFirst({ where: { parentId: payerId, childId: member.id, status: "ACCEPTED" }, select: { id: true } }),
  ]);
  return invite || link ? member : null;
}

/**
 * What the payer may see about someone they are putting on a group: their scholarship percent, but ONLY for a person who has accepted
 * this payer (the price depends on it, so the payer is shown it), never for an arbitrary address. Null when they may not see it.
 */
export async function scholarshipPercentForAccepted(payerId: string, rawEmail: string): Promise<number | null> {
  const member = await acceptedMemberOf(payerId, rawEmail);
  if (!member) return null;
  return (await scholarshipPercentsFor([member.id])).get(member.id) ?? 0;
}

/** A group's payer types a scholarship code on one person's row. Refused unless that person has accepted this payer. */
export async function claimScholarshipForMember(payerId: string, rawEmail: string, rawCode: unknown): Promise<{ percent: number }> {
  const payer = await prisma.user.findUnique({ where: { id: payerId }, select: { id: true, email: true, name: true, role: true, bannedAt: true } });
  if (!payer || payer.bannedAt || payer.role !== "STUDENT") throw new ScholarshipError("Your account cannot do that.");
  const member = await acceptedMemberOf(payerId, rawEmail);
  // One answer whether the person does not exist, has not accepted, or the code is wrong, so this cannot be used to look people up.
  if (!member) throw new ScholarshipError("That code isn't valid for this person. Check the 16 digits and that it was made for the email on this row.");
  const { percent } = await claimScholarshipCode(member.id, rawCode, { id: payer.id, email: payer.email, name: payer.name });
  return { percent };
}

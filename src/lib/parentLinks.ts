import { prisma } from "@/lib/prisma";
import { checkFamilyMember } from "@/lib/familyMemberCheck";
import { createNotification } from "@/lib/notifications";
import { consumeRateLimit } from "@/lib/rateLimit";
import { MAX_FAMILY_MEMBERS } from "@/lib/classCreditPricing";

/**
 * Parent mode: a parent links to a child's OWN account (found by the email typed, the same "does this account exist" check the group
 * plan uses). The child says yes once; while the link is ACCEPTED the parent can see the child's progress, practice and classes, change
 * their class times, and pay for their plan. Either side can end it any time. Nothing about it changes the parent's own account: they can
 * keep learning themselves, with or without a plan of their own.
 */
export class ParentLinkError extends Error {}

export type LinkState = "PENDING" | "ACCEPTED" | "DECLINED";

/** Someone who said no is not asked again by the same parent for this long. */
export const PARENT_LINK_DECLINE_DAYS = 30;
/** A waiting request is not announced to the child again more often than this. */
const RENOTIFY_MS = 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** The most children one parent can link (the same ceiling a group plan has). */
export const MAX_LINKED_CHILDREN = MAX_FAMILY_MEMBERS - 1;

const nameOf = (u: { name: string | null; email: string }) => u.name ?? u.email;

/** Asks a child's account to be linked. Nothing is shared until they accept. */
export async function sendParentLink(parentId: string, rawEmail: string): Promise<LinkState> {
  const email = rawEmail.trim().toLowerCase();
  const check = await checkFamilyMember(parentId, email);
  if (check === "self") throw new ParentLinkError("That is your own account.");
  if (check === "invalid") throw new ParentLinkError("That does not look like an email yet.");
  if (check === "no_account") throw new ParentLinkError("No account with this email. Your child needs to register first.");
  if (check === "needs_name") throw new ParentLinkError("This account needs a first and last name before it can be linked.");

  await consumeRateLimit(prisma, `parent-link:${parentId}`, { windowMinutes: 60, max: 20, message: "Too many requests. Please wait a while and try again." });

  const [parent, child] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: parentId }, select: { name: true, email: true } }),
    prisma.user.findUniqueOrThrow({ where: { email }, select: { id: true } }),
  ]);
  // Nobody is both: if that account already has you linked as THEIR child, one of you has the roles the wrong way round.
  const reverse = await prisma.parentLink.findFirst({ where: { parentId: child.id, childId: parentId, status: { not: "DECLINED" } }, select: { id: true } });
  if (reverse) throw new ParentLinkError("That account is already linked to you the other way round. Ask them to end that link first.");

  const existing = await prisma.parentLink.findUnique({ where: { parentId_childId: { parentId, childId: child.id } } });
  const now = Date.now();
  if (existing?.status === "ACCEPTED") return "ACCEPTED";
  if (existing?.status === "DECLINED" && existing.respondedAt && now - existing.respondedAt.getTime() < PARENT_LINK_DECLINE_DAYS * DAY_MS) return "DECLINED";
  if (existing?.status === "PENDING" && now - existing.createdAt.getTime() < RENOTIFY_MS) return "PENDING";

  const count = await prisma.parentLink.count({ where: { parentId, status: { in: ["PENDING", "ACCEPTED"] } } });
  if (!existing && count >= MAX_LINKED_CHILDREN) throw new ParentLinkError(`You can link up to ${MAX_LINKED_CHILDREN} accounts.`);

  await prisma.parentLink.upsert({
    where: { parentId_childId: { parentId, childId: child.id } },
    create: { parentId, childId: child.id, status: "PENDING" },
    update: { status: "PENDING", createdAt: new Date(), respondedAt: null },
  });
  await createNotification({
    userId: child.id,
    type: "PARENT_LINK_REQUEST",
    emailCategory: "roleUpdates",
    title: "A parent account wants to link to you",
    body: `${nameOf(parent)} asked to be your parent account. If you accept, they can see your progress, practice and classes, change your class times, and pay for your plan. You can still use your account as always, and you can end the link any time in Settings > Parent mode. Nothing is shared unless you accept.`,
  });
  return "PENDING";
}

/** The child's answer. Only their own, still-waiting request can be answered. */
export async function respondToParentLink(childId: string, linkId: string, accept: boolean): Promise<void> {
  const claimed = await prisma.parentLink.updateMany({
    where: { id: linkId, childId, status: "PENDING" },
    data: accept ? { status: "ACCEPTED", respondedAt: new Date() } : { status: "DECLINED", respondedAt: new Date() },
  });
  if (claimed.count === 0) throw new ParentLinkError("That request is no longer waiting.");
  if (accept) {
    const link = await prisma.parentLink.findUniqueOrThrow({ where: { id: linkId }, select: { parentId: true, child: { select: { name: true, email: true } } } });
    await createNotification({
      userId: link.parentId,
      type: "PARENT_LINK_ACCEPTED",
      emailCategory: "roleUpdates",
      title: "Your child's account is linked",
      body: `${nameOf(link.child)} accepted. Open Parent mode in Settings to see their progress, practice and classes, and to start or pay for their plan.`,
    });
  }
}

/** Ends a link from either side (the parent removing a child, a child removing a parent) or withdraws a waiting request. */
export async function endParentLink(userId: string, otherId: string): Promise<void> {
  await prisma.parentLink.deleteMany({
    where: { status: { not: "DECLINED" }, OR: [{ parentId: userId, childId: otherId }, { parentId: otherId, childId: userId }] },
  });
}

/** Withdraws the parent's own waiting or accepted request for the account with this email. */
export async function cancelParentLinkByEmail(parentId: string, rawEmail: string): Promise<void> {
  const email = rawEmail.trim().toLowerCase();
  await prisma.parentLink.deleteMany({ where: { parentId, child: { email }, status: { not: "DECLINED" } } });
}

/** Throws unless this parent is linked (accepted) to this child. The one gate every parent action goes through. */
export async function assertParentOf(parentId: string, childId: string): Promise<void> {
  const link = await prisma.parentLink.findFirst({ where: { parentId, childId, status: "ACCEPTED" }, select: { id: true } });
  if (!link) throw new ParentLinkError("That account is not linked to you.");
}

export async function isParentOf(parentId: string, childId: string): Promise<boolean> {
  return Boolean(await prisma.parentLink.findFirst({ where: { parentId, childId, status: "ACCEPTED" }, select: { id: true } }));
}

export interface LinkedChild {
  linkId: string;
  childId: string;
  name: string;
  email: string;
  status: LinkState;
}

/** Everyone this parent asked or linked, newest last, declined ones left out. */
export async function listLinksFromParent(parentId: string): Promise<LinkedChild[]> {
  const rows = await prisma.parentLink.findMany({
    where: { parentId, status: { in: ["PENDING", "ACCEPTED"] } },
    include: { child: { select: { name: true, email: true } } },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((r) => ({ linkId: r.id, childId: r.childId, name: nameOf(r.child), email: r.child.email.toLowerCase(), status: r.status }));
}

/** The shape the plan form's invite hook expects: email and where it stands. */
export async function listLinkStatesFromParent(parentId: string): Promise<{ email: string; status: LinkState }[]> {
  const rows = await prisma.parentLink.findMany({ where: { parentId }, include: { child: { select: { email: true } } }, orderBy: { createdAt: "asc" } });
  return rows
    .filter((r) => r.status !== "DECLINED" || (r.respondedAt && Date.now() - r.respondedAt.getTime() < PARENT_LINK_DECLINE_DAYS * DAY_MS))
    .map((r) => ({ email: r.child.email.toLowerCase(), status: r.status }));
}

export interface ParentRequest {
  linkId: string;
  parentName: string;
}

/** Waiting requests addressed to this person, and the parents already linked. */
export async function listLinksToChild(childId: string): Promise<{ requests: ParentRequest[]; parents: { parentId: string; name: string }[] }> {
  const rows = await prisma.parentLink.findMany({
    where: { childId, status: { in: ["PENDING", "ACCEPTED"] } },
    include: { parent: { select: { name: true, email: true } } },
    orderBy: { createdAt: "desc" },
  });
  return {
    requests: rows.filter((r) => r.status === "PENDING").map((r) => ({ linkId: r.id, parentName: nameOf(r.parent) })),
    parents: rows.filter((r) => r.status === "ACCEPTED").map((r) => ({ parentId: r.parentId, name: nameOf(r.parent) })),
  };
}

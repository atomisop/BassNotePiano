import { prisma } from "@/lib/prisma";
import { checkFamilyMember } from "@/lib/familyMemberCheck";
import { createNotification } from "@/lib/notifications";
import { consumeRateLimit, RateLimitError } from "@/lib/rateLimit";
import { MAX_FAMILY_MEMBERS } from "@/lib/classCreditPricing";
import { sendRegisterInvite } from "@/lib/registerInvite";
import { answerHref } from "@/lib/bellAnswers";

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
/** A request for an email with no account yet is remembered this long, waiting for that account to be made. */
export const PARENT_INVITE_DAYS = 30;
const inviteCutoff = () => new Date(Date.now() - PARENT_INVITE_DAYS * DAY_MS);

/** The most children one parent can link (the same ceiling a group plan has). */
export const MAX_LINKED_CHILDREN = MAX_FAMILY_MEMBERS - 1;

const nameOf = (u: { name: string | null; email: string }) => u.name ?? u.email;

/**
 * Asks a child's account to be linked. Nothing is shared until they accept.
 *
 * An email with no account yet gets the same answer ("PENDING", request sent): the request is remembered against that email, the
 * address is emailed an invitation to make an account, and once an account with it exists and has confirmed its email, the request
 * reaches them like any other (claimParentInvites). So the parent never has to come back and ask again.
 */
export async function sendParentLink(parentId: string, rawEmail: string): Promise<LinkState> {
  const email = rawEmail.trim().toLowerCase();
  // Limits come BEFORE the lookup: the answers differ ("needs a name" vs a request sent), so unlimited tries would list who has an account.
  await consumeRateLimit(prisma, `parent-link:${parentId}`, { windowMinutes: 60, max: 20, message: "Too many requests. Please wait a while and try again." });
  await consumeRateLimit(prisma, `parent-link-pair:${parentId}:${email.slice(0, 120)}`, { windowMinutes: 60, max: 3, message: "You already asked this account a few times. Please wait before asking again." });
  const check = await checkFamilyMember(parentId, email);
  if (check === "self") throw new ParentLinkError("That is your own account.");
  if (check === "invalid") throw new ParentLinkError("That does not look like an email yet.");
  if (check === "no_account") return rememberParentInvite(parentId, email);
  if (check === "needs_name") throw new ParentLinkError("This account needs a first and last name before it can be linked.");

  const child = await prisma.user.findUniqueOrThrow({ where: { email }, select: { id: true } });
  const result = await requestLink(parentId, child.id);
  if (result === "REVERSE") throw new ParentLinkError("That account is already linked to you the other way round. Ask them to end that link first.");
  if (result === "FULL") throw new ParentLinkError(`You can link up to ${MAX_LINKED_CHILDREN} accounts.`);
  return result;
}

/** How many children this parent has linked or asked, emails still waiting for an account included. */
async function linkCount(parentId: string): Promise<number> {
  const [links, invites] = await Promise.all([
    prisma.parentLink.count({ where: { parentId, status: { in: ["PENDING", "ACCEPTED"] } } }),
    prisma.parentLinkInvite.count({ where: { parentId, createdAt: { gt: inviteCutoff() } } }),
  ]);
  return links + invites;
}

/**
 * Makes (or refreshes) a waiting request from this parent to this account and tells the child, unless it is already answered, was
 * declined recently, would put the roles the wrong way round, or the parent has no room left. The one place a request is made.
 */
async function requestLink(parentId: string, childId: string): Promise<LinkState | "REVERSE" | "FULL"> {
  // Nobody is both: if that account already has you linked as THEIR child, one of you has the roles the wrong way round.
  const reverse = await prisma.parentLink.findFirst({ where: { parentId: childId, childId: parentId, status: { not: "DECLINED" } }, select: { id: true } });
  if (reverse) return "REVERSE";

  const existing = await prisma.parentLink.findUnique({ where: { parentId_childId: { parentId, childId } } });
  const now = Date.now();
  if (existing?.status === "ACCEPTED") return "ACCEPTED";
  if (existing?.status === "DECLINED" && existing.respondedAt && now - existing.respondedAt.getTime() < PARENT_LINK_DECLINE_DAYS * DAY_MS) return "DECLINED";
  if (existing?.status === "PENDING" && now - existing.createdAt.getTime() < RENOTIFY_MS) return "PENDING";

  if (!existing && (await linkCount(parentId)) >= MAX_LINKED_CHILDREN) return "FULL";

  const parent = await prisma.user.findUniqueOrThrow({ where: { id: parentId }, select: { name: true, email: true } });
  const link = await prisma.parentLink.upsert({
    where: { parentId_childId: { parentId, childId } },
    create: { parentId, childId, status: "PENDING" },
    update: { status: "PENDING", createdAt: new Date(), respondedAt: null },
  });
  await createNotification({
    userId: childId,
    type: "PARENT_LINK_REQUEST",
    emailCategory: "roleUpdates",
    title: "A parent account wants to link to you",
    body: `${nameOf(parent)} asked to be your parent account. If you accept, they can see your progress, practice and classes, change your class times, and pay for your plan. You can still use your account as always, and you can end the link any time in Settings > Parent mode. Nothing is shared unless you accept.`,
    // The bell shows Accept and Decline on this notice; tapping it still opens Settings for anyone who prefers that.
    href: answerHref("/account?tab=account#parent-mode", link.id),
  });
  return "PENDING";
}

/**
 * The no-account side of sendParentLink: remembers the request and emails the address an invitation to make an account. Answers
 * "PENDING" whatever happens, exactly like a request to an existing account, so the reply says nothing more about the address.
 */
async function rememberParentInvite(parentId: string, email: string): Promise<LinkState> {
  // A banned or admin account answers like a missing one (checkFamilyMember); nothing is remembered or sent for those.
  if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) return "PENDING";
  await prisma.parentLinkInvite.deleteMany({ where: { createdAt: { lte: inviteCutoff() } } });
  const existing = await prisma.parentLinkInvite.findUnique({ where: { parentId_email: { parentId, email } }, select: { id: true } });
  if (!existing && (await linkCount(parentId)) >= MAX_LINKED_CHILDREN) throw new ParentLinkError(`You can link up to ${MAX_LINKED_CHILDREN} accounts.`);
  await prisma.parentLinkInvite.upsert({
    where: { parentId_email: { parentId, email } },
    create: { parentId, email },
    update: { createdAt: new Date() },
  });
  try {
    // At most one invitation to an address every two weeks, whoever asks (registerInvite.ts). The request is remembered either way.
    await sendRegisterInvite(parentId, email, { purpose: "parent" });
  } catch (err) {
    if (!(err instanceof RateLimitError)) throw err;
  }
  return "PENDING";
}

/**
 * Turns requests remembered for this account's email into waiting requests it can accept or decline. Runs when the person opens Home,
 * the bell or Parent mode, and only once the account has confirmed its email, so an address nobody owns yet cannot be claimed. Each
 * remembered row is used once. Returns how many requests reached them.
 */
export async function claimParentInvites(userId: string, rawEmail: string | null | undefined): Promise<number> {
  const email = rawEmail?.trim().toLowerCase();
  if (!email) return 0;
  const invites = await prisma.parentLinkInvite.findMany({ where: { email }, select: { id: true, parentId: true, createdAt: true }, orderBy: { createdAt: "asc" } });
  if (invites.length === 0) return 0;
  const me = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, emailVerified: true, role: true, bannedAt: true } });
  if (!me || me.email.toLowerCase() !== email || !me.emailVerified) return 0;
  const cutoff = inviteCutoff().getTime();
  let reached = 0;
  for (const invite of invites) {
    // Taken once: two tabs opening Home at the same moment cannot both turn it into a request.
    const taken = await prisma.parentLinkInvite.deleteMany({ where: { id: invite.id } });
    if (taken.count === 0 || invite.createdAt.getTime() <= cutoff) continue;
    if (me.role !== "STUDENT" || me.bannedAt || invite.parentId === userId) continue;
    const parent = await prisma.user.findUnique({ where: { id: invite.parentId }, select: { bannedAt: true } });
    if (!parent || parent.bannedAt) continue;
    if ((await requestLink(invite.parentId, userId)) === "PENDING") reached++;
  }
  return reached;
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
      body: `${nameOf(link.child)} accepted. You can now see their progress, practice and classes, and start or pay for their plan.`,
      cta: { label: "Open their page", path: `/parent/${childId}` },
    });
  }
}

/** Ends a link from either side (the parent removing a child, a child removing a parent) or withdraws a waiting request. */
export async function endParentLink(userId: string, otherId: string): Promise<void> {
  // A child who ends a link is remembered like a "no": the same parent cannot ask again straight away (see PARENT_LINK_DECLINE_DAYS).
  await prisma.parentLink.updateMany({ where: { parentId: otherId, childId: userId, status: { in: ["PENDING", "ACCEPTED"] } }, data: { status: "DECLINED", respondedAt: new Date() } });
  await prisma.parentLink.deleteMany({
    where: { status: { not: "DECLINED" }, parentId: userId, childId: otherId },
  });
}

/** Withdraws the parent's own waiting or accepted request for the account with this email, or a request still waiting for that email to get an account. */
export async function cancelParentLinkByEmail(parentId: string, rawEmail: string): Promise<void> {
  const email = rawEmail.trim().toLowerCase();
  await prisma.parentLink.deleteMany({ where: { parentId, child: { email }, status: { not: "DECLINED" } } });
  await prisma.parentLinkInvite.deleteMany({ where: { parentId, email } });
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
  /** Asked before the email had an account: waiting for them to make one (there is no childId yet). */
  awaitingAccount?: boolean;
}

/** Everyone this parent asked or linked, newest last, declined ones left out. Emails still waiting for an account come last. */
export async function listLinksFromParent(parentId: string): Promise<LinkedChild[]> {
  const [rows, invites] = await Promise.all([
    prisma.parentLink.findMany({
      where: { parentId, status: { in: ["PENDING", "ACCEPTED"] } },
      include: { child: { select: { name: true, email: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.parentLinkInvite.findMany({ where: { parentId, createdAt: { gt: inviteCutoff() } }, orderBy: { createdAt: "asc" } }),
  ]);
  return [
    ...rows.map((r) => ({ linkId: r.id, childId: r.childId, name: nameOf(r.child), email: r.child.email.toLowerCase(), status: r.status })),
    ...invites.map((i) => ({ linkId: `invite:${i.id}`, childId: "", name: i.email, email: i.email, status: "PENDING" as const, awaitingAccount: true })),
  ];
}

/** The children this parent manages (accepted links), for Home, the sidebar and the profile menu. */
export async function listLinkedChildren(parentId: string): Promise<{ id: string; name: string }[]> {
  const rows = await prisma.parentLink.findMany({
    where: { parentId, status: "ACCEPTED", child: { bannedAt: null } },
    select: { child: { select: { id: true, name: true, email: true } } },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((r) => ({ id: r.child.id, name: nameOf(r.child) }));
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

/** True when a parent is linked to this account: the schedule is theirs to change, not the child's. */
export async function hasParentControl(childId: string): Promise<boolean> {
  return Boolean(await prisma.parentLink.findFirst({ where: { childId, status: "ACCEPTED" }, select: { id: true } }));
}

export const PARENT_CONTROL_MESSAGE = "Your schedule is controlled by your parent.";

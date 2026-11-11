import { prisma } from "@/lib/prisma";
import { calculatePaymentPlanRate, discountedPlanPriceCents } from "@/lib/classCreditPricing";
import { getPricingConfig } from "@/lib/pricing";
import { getDiscountPercent } from "@/lib/accountDiscounts";
import { PaymentPlanError, noticeFamilyShrank } from "@/lib/paymentPlans";
import { MAX_LINKED_CHILDREN } from "@/lib/parentLinks";
import { createNotification } from "@/lib/notifications";
import { noticePlanUpdated } from "@/lib/studentNotices";
import { logAudit } from "@/lib/audit";
import { PlanFixError, groupNotStartedError, refuseWhileInReview } from "@/lib/planFixes";

/**
 * The studio's tools for group and parent plans, beyond what each person's own plan already allows: see who is on a group and who pays,
 * take one person off a group onto a plan of their own, make someone else the payer, and link or unlink a parent and a child directly
 * (for a family the studio already knows, without the email-and-accept round trip). Each is audited and the people involved are told.
 */

const usd = (cents: number) => (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
const nameOf = (u: { name: string | null; email: string }) => u.name ?? u.email;

export interface GroupMember {
  planId: string;
  userId: string;
  name: string;
  status: string;
  started: boolean;
  priceCents: number;
}

export interface GroupView {
  groupId: string;
  kind: "FAMILY" | "PARENT";
  payer: { id: string; name: string };
  members: GroupMember[];
  /** Who could be made the payer instead: the other running members (group plan), or the children's other linked parents (parent plan). */
  payerChoices: { id: string; name: string }[];
}

export async function getGroupView(groupId: string): Promise<GroupView> {
  const group = await prisma.familyPlanGroup.findUnique({
    where: { id: groupId },
    select: {
      id: true,
      kind: true,
      payer: { select: { id: true, name: true, email: true } },
      plans: { orderBy: { createdAt: "asc" }, select: { id: true, userId: true, status: true, installmentsPaid: true, installmentAmountCents: true, user: { select: { name: true, email: true } } } },
    },
  });
  if (!group) throw new PaymentPlanError("That group no longer exists.");
  const members = group.plans.map((p) => ({ planId: p.id, userId: p.userId, name: nameOf(p.user), status: p.status, started: p.installmentsPaid > 0, priceCents: p.installmentAmountCents }));
  const running = members.filter((m) => m.status === "ACTIVE");
  let payerChoices: { id: string; name: string }[];
  if (group.kind === "FAMILY") {
    payerChoices = running.filter((m) => m.userId !== group.payer.id).map((m) => ({ id: m.userId, name: m.name }));
  } else {
    const childIds = running.filter((m) => m.userId !== group.payer.id).map((m) => m.userId);
    const links = childIds.length ? await prisma.parentLink.findMany({ where: { childId: { in: childIds }, status: "ACCEPTED", parentId: { not: group.payer.id } }, select: { parentId: true, childId: true, parent: { select: { name: true, email: true } } } }) : [];
    const byParent = new Map<string, { name: string; children: Set<string> }>();
    for (const l of links) {
      const entry = byParent.get(l.parentId) ?? { name: nameOf(l.parent), children: new Set<string>() };
      entry.children.add(l.childId);
      byParent.set(l.parentId, entry);
    }
    // A new payer for a parent plan has to be a linked parent of every child on it.
    payerChoices = Array.from(byParent.entries()).filter(([, v]) => v.children.size === childIds.length).map(([id, v]) => ({ id, name: v.name }));
  }
  return { groupId: group.id, kind: group.kind, payer: { id: group.payer.id, name: nameOf(group.payer) }, members, payerChoices };
}

/**
 * Takes one person off a group or parent plan onto a plan of their own: same weekly time, term, credits and paid bills, the solo price
 * (their personal discount applied) from the next bill, and the bills are theirs to pay. The group carries on without them.
 */
export async function separateFromGroup(adminId: string, planId: string): Promise<string> {
  const plan = await prisma.paymentPlan.findUnique({ where: { id: planId }, select: { id: true, userId: true, status: true, cadence: true, term: true, installmentsPaid: true, familyGroupId: true, familyGroup: { select: { kind: true, payerId: true } } } });
  if (!plan || plan.status !== "ACTIVE") throw new PaymentPlanError("Only a running plan can be moved.");
  if (!plan.familyGroupId || !plan.familyGroup) throw new PaymentPlanError("This plan is not part of a group.");
  if (plan.installmentsPaid < 1) throw groupNotStartedError(plan.familyGroupId);
  if (plan.familyGroup.kind === "FAMILY" && plan.familyGroup.payerId === plan.userId) {
    const others = await prisma.paymentPlan.count({ where: { familyGroupId: plan.familyGroupId, status: "ACTIVE", id: { not: plan.id } } });
    if (others > 0) throw new PaymentPlanError("This person pays for the group. Make someone else the payer first, then give them their own plan.");
  }
  await refuseWhileInReview(plan.id);

  const rate = calculatePaymentPlanRate(plan.cadence, plan.term, await getPricingConfig());
  const discount = await getDiscountPercent(plan.userId, plan.term);
  const price = discountedPlanPriceCents(rate.installmentAmountCents, discount);
  const groupId = plan.familyGroupId;
  await prisma.$transaction([
    prisma.zellePayment.updateMany({ where: { paymentPlanId: plan.id, status: "AWAITING_TRANSFER" }, data: { status: "EXPIRED" } }),
    prisma.paymentPlan.update({ where: { id: plan.id }, data: { familyGroupId: null, installmentAmountCents: price, listAmountCents: discount > 0 ? rate.installmentAmountCents : null } }),
  ]);
  await noticeFamilyShrank(groupId).catch(() => undefined);
  await noticePlanUpdated({
    userId: plan.userId,
    title: "You have your own plan now",
    body: `The studio moved you off the group plan onto a plan of your own. Your weekly time, classes and credits stay the same. From your next bill you pay it yourself: ${usd(price)} every 28 days.`,
  });
  await logAudit({ actorId: adminId, action: "plan.separate", targetType: "PaymentPlan", targetId: plan.id, detail: `Moved off the group onto their own plan, ${usd(price)} a bill` }).catch(() => undefined);
  return usd(price);
}

/** Makes someone else the group's payer: only their bank account settles the group's bills from now on. */
export async function changeGroupPayer(adminId: string, groupId: string, newPayerId: string): Promise<string> {
  const view = await getGroupView(groupId);
  if (newPayerId === view.payer.id) throw new PaymentPlanError("They already pay for this group.");
  const choice = view.payerChoices.find((c) => c.id === newPayerId);
  if (!choice) throw new PaymentPlanError(view.kind === "FAMILY" ? "The payer has to be someone on the group with a running plan." : "The payer has to be a linked parent of every child on the plan.");
  const inReview = await prisma.zellePayment.findFirst({ where: { status: "PENDING_REVIEW", paymentPlan: { familyGroupId: groupId } }, select: { id: true } });
  if (inReview) throw new PlanFixError("A payment for this group is waiting for review. Approve or reject it below, then try again.", { kind: "payment", paymentId: inReview.id });
  await prisma.familyPlanGroup.update({ where: { id: groupId }, data: { payerId: newPayerId } });
  // An open combined bill belongs to the old payer: close it and open it again for the new one.
  const { syncGroupBundle } = await import("@/lib/paymentBundles");
  await syncGroupBundle(groupId, process.env.ZELLE_HANDLE ?? "payments@yourplatform.com").catch(() => undefined);
  const body = `${choice.name} now pays for the group plan. Only their bank account settles its bills from now on; the plans, weekly times and credits stay the same.`;
  for (const userId of new Set([view.payer.id, newPayerId])) {
    await createNotification({ userId, type: "PAYMENT_PLAN_UPDATED", title: "The group plan has a new payer", body, emailCategory: "payments" }).catch(() => undefined);
  }
  await logAudit({ actorId: adminId, action: "group.payer", targetType: "FamilyPlanGroup", targetId: groupId, detail: `Payer ${view.payer.name} to ${choice.name}` }).catch(() => undefined);
  return choice.name;
}

export interface AdminLinkRow {
  linkId: string;
  role: "parent" | "child";
  otherId: string;
  name: string;
  status: "PENDING" | "ACCEPTED";
}

/** This person's parent links, both ways: the children they look after and the parents who look after them. */
export async function listLinksFor(userId: string): Promise<AdminLinkRow[]> {
  const rows = await prisma.parentLink.findMany({
    where: { OR: [{ parentId: userId }, { childId: userId }], status: { in: ["PENDING", "ACCEPTED"] } },
    orderBy: { createdAt: "asc" },
    select: { id: true, parentId: true, childId: true, status: true, parent: { select: { name: true, email: true } }, child: { select: { name: true, email: true } } },
  });
  return rows.map((r) =>
    r.parentId === userId
      ? { linkId: r.id, role: "child" as const, otherId: r.childId, name: nameOf(r.child), status: r.status as "PENDING" | "ACCEPTED" }
      : { linkId: r.id, role: "parent" as const, otherId: r.parentId, name: nameOf(r.parent), status: r.status as "PENDING" | "ACCEPTED" },
  );
}

/**
 * Links a parent and a child directly, already accepted, for a family the studio knows (they asked in person). Both are told, and the
 * child can still end it any time in Settings > Parent mode.
 */
export async function adminLinkParent(adminId: string, userId: string, otherEmail: string, userIs: "parent" | "child"): Promise<string> {
  const email = otherEmail.trim().toLowerCase();
  if (!email.includes("@")) throw new PaymentPlanError("Type the other account's email.");
  const [me, other] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, email: true, role: true, bannedAt: true } }),
    prisma.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } }, select: { id: true, name: true, email: true, role: true, bannedAt: true } }),
  ]);
  if (!me) throw new PaymentPlanError("That account no longer exists.");
  if (!other) throw new PaymentPlanError("No account with that email.");
  if (other.id === me.id) throw new PaymentPlanError("That is this same account.");
  for (const u of [me, other]) {
    if (u.role !== "STUDENT" || u.bannedAt) throw new PaymentPlanError(`${u.email} cannot be linked.`);
  }
  const parent = userIs === "parent" ? me : other;
  const child = userIs === "parent" ? other : me;
  const reverse = await prisma.parentLink.findFirst({ where: { parentId: child.id, childId: parent.id, status: { not: "DECLINED" } }, select: { id: true } });
  if (reverse) throw new PaymentPlanError("These two are already linked the other way round. Remove that link first.");
  const existing = await prisma.parentLink.findUnique({ where: { parentId_childId: { parentId: parent.id, childId: child.id } }, select: { status: true } });
  if (existing?.status === "ACCEPTED") throw new PaymentPlanError("They are already linked.");
  const count = await prisma.parentLink.count({ where: { parentId: parent.id, status: "ACCEPTED" } });
  if (count >= MAX_LINKED_CHILDREN) throw new PaymentPlanError(`A parent can link up to ${MAX_LINKED_CHILDREN} accounts.`);
  const now = new Date();
  await prisma.parentLink.upsert({
    where: { parentId_childId: { parentId: parent.id, childId: child.id } },
    create: { parentId: parent.id, childId: child.id, status: "ACCEPTED", respondedAt: now },
    update: { status: "ACCEPTED", respondedAt: now },
  });
  await createNotification({
    userId: child.id,
    type: "PARENT_LINK_ACCEPTED",
    emailCategory: "roleUpdates",
    title: "The studio linked your parent account",
    body: `${nameOf(parent)} is now your parent account. They can see your progress, practice and classes, change your class times, and pay for your plan. You can end the link any time in Settings > Parent mode.`,
  }).catch(() => undefined);
  await createNotification({
    userId: parent.id,
    type: "PARENT_LINK_ACCEPTED",
    emailCategory: "roleUpdates",
    title: "Your child's account is linked",
    body: `The studio linked ${nameOf(child)} to your account. Open Parent mode in Settings to see their progress, practice and classes, and to pay for their plan.`,
  }).catch(() => undefined);
  await logAudit({ actorId: adminId, action: "parent.link", targetType: "User", targetId: userId, detail: `Linked ${parent.email} as the parent of ${child.email}` }).catch(() => undefined);
  return userIs === "parent" ? nameOf(child) : nameOf(parent);
}

/** Ends a parent link (or withdraws a waiting request). Either person can be linked again later. Plans already paid are not touched. */
export async function adminUnlinkParent(adminId: string, userId: string, linkId: string): Promise<string> {
  const link = await prisma.parentLink.findFirst({
    where: { id: linkId, OR: [{ parentId: userId }, { childId: userId }] },
    select: { id: true, parentId: true, childId: true, status: true, parent: { select: { name: true, email: true } }, child: { select: { name: true, email: true } } },
  });
  if (!link) throw new PaymentPlanError("That link no longer exists.");
  await prisma.parentLink.delete({ where: { id: link.id } });
  if (link.status === "ACCEPTED") {
    const body = `The studio ended the parent link between ${nameOf(link.parent)} and ${nameOf(link.child)}. Plans already paid carry on as they are.`;
    for (const id of [link.parentId, link.childId]) {
      await createNotification({ userId: id, type: "PARENT_LINK_ACCEPTED", emailCategory: "roleUpdates", title: "A parent link ended", body }).catch(() => undefined);
    }
  }
  await logAudit({ actorId: adminId, action: "parent.unlink", targetType: "User", targetId: userId, detail: `Ended the link: ${link.parent.email} parent of ${link.child.email}` }).catch(() => undefined);
  return link.parentId === userId ? nameOf(link.child) : nameOf(link.parent);
}

"use server";

import { revalidatePath } from "next/cache";
import { getServerAuthSession } from "@/lib/auth";
import { getUnreadCount, getRecentNotifications, markAllNotificationsRead, markNotificationRead } from "@/lib/notifications";
import { notificationTarget, safeInAppHref } from "@/lib/notificationTargets";
import { dismissAnnouncement } from "@/lib/announcements";
import { getMailUnreadCount, listMail, openMail } from "@/lib/mail";
import { prisma } from "@/lib/prisma";
import { answerIdFrom, answerKindFor, type AnswerKind, type AnswerState } from "@/lib/bellAnswers";
import { claimParentInvites, ParentLinkError, respondToParentLink } from "@/lib/parentLinks";
import { FamilyInviteError, inviteIsFresh, respondToFamilyInvite } from "@/lib/familyInvites";
import { respondToFriendRequest, SocialError } from "@/lib/social";
import { RateLimitError } from "@/lib/rateLimit";
import { claimFriendEmailAsks } from "@/lib/social";

export interface NotificationRow {
  id: string;
  type: string;
  title: string;
  body: string | null;
  read: boolean;
  createdAt: string;
  /** Where tapping it goes, when it is not decided by the type (a mail row opens its button's page, or the message itself). */
  href?: string;
  /** A request answered right on the entry (friend, parent link, group plan), and where it stands now. */
  answer?: { kind: AnswerKind; state: AnswerState };
}

export async function fetchNotificationsAction(): Promise<{
  unreadCount: number;
  notifications: NotificationRow[];
  mailUnreadCount: number;
  mail: NotificationRow[];
}> {
  const session = await getServerAuthSession();
  if (!session?.user) return { unreadCount: 0, notifications: [], mailUnreadCount: 0, mail: [] };
  const userId = session.user.id;
  // A parent's request made before this account existed reaches it as soon as the account is in use (one indexed lookup, usually empty).
  await claimParentInvites(userId, session.user.email).catch((err) => console.error("Claiming parent requests failed (non-blocking):", err));
  await claimFriendEmailAsks(userId, session.user.email).catch((err) => console.error("Claiming book-together asks failed (non-blocking):", err));

  const [unreadCount, rows, mailUnreadCount, mailRows] = await Promise.all([
    getUnreadCount(userId),
    getRecentNotifications(userId),
    getMailUnreadCount(userId),
    listMail(userId, 40),
  ]);
  const answers = await answerStates(userId, rows);

  return {
    unreadCount,
    mailUnreadCount,
    mail: mailRows.map((m) => ({
      id: m.id,
      type: m.kind,
      title: m.title,
      body: m.body,
      read: m.readAt !== null,
      createdAt: m.createdAt.toISOString(),
      // A message with a button opens that page straight from the bell (the bell marks it read); one without opens the message.
      href: safeInAppHref(m.actionHref) ?? `/mail/${m.id}`,
    })),
    notifications: rows.map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      body: n.body,
      read: n.readAt !== null,
      createdAt: n.createdAt.toISOString(),
      href: notificationTarget(n.type, n.href) ?? undefined,
      answer: answers.get(n.id),
    })),
  };
}

type Answerable = { id: string; type: string; href: string | null };

/** Where each request on the shown entries stands now (it may have been answered on its own page since). Only this person's own requests. */
async function answerStates(userId: string, rows: Answerable[]): Promise<Map<string, { kind: AnswerKind; state: AnswerState }>> {
  const wanted = rows.flatMap((n) => {
    const kind = answerKindFor(n.type);
    const id = answerIdFrom(n.href);
    return kind && id ? [{ notificationId: n.id, kind, id }] : [];
  });
  const result = new Map<string, { kind: AnswerKind; state: AnswerState }>();
  if (wanted.length === 0) return result;
  const idsOf = (kind: AnswerKind) => wanted.filter((w) => w.kind === kind).map((w) => w.id);
  const [friends, parents, groups] = await Promise.all([
    idsOf("friend").length ? prisma.friendRequest.findMany({ where: { id: { in: idsOf("friend") }, receiverId: userId }, select: { id: true, status: true } }) : [],
    idsOf("parent").length ? prisma.parentLink.findMany({ where: { id: { in: idsOf("parent") }, childId: userId }, select: { id: true, status: true } }) : [],
    idsOf("group").length ? prisma.familyInvite.findMany({ where: { id: { in: idsOf("group") }, inviteeId: userId }, select: { id: true, status: true, createdAt: true } }) : [],
  ]);
  const state = new Map<string, AnswerState>();
  for (const f of friends) state.set(f.id, f.status === "PENDING" ? "PENDING" : f.status === "ACCEPTED" ? "ACCEPTED" : "DECLINED");
  for (const p of parents) state.set(p.id, p.status);
  for (const g of groups) state.set(g.id, g.status === "PENDING" && !inviteIsFresh(g.createdAt) ? "GONE" : g.status);
  for (const w of wanted) result.set(w.notificationId, { kind: w.kind, state: state.get(w.id) ?? "GONE" });
  return result;
}

/**
 * Accept or Decline tapped on a bell entry. The entry names the request (its own link records it), and the answer goes through the same
 * function its own page uses, which checks again that the request is this person's and still waiting. The entry is marked read.
 */
export async function answerFromBellAction(notificationId: string, accept: boolean): Promise<{ ok: true; state: AnswerState } | { ok: false; error: string }> {
  const session = await getServerAuthSession();
  if (!session?.user) return { ok: false, error: "Sign in again." };
  const userId = session.user.id;
  const notice = await prisma.notification.findFirst({ where: { id: String(notificationId), userId }, select: { id: true, type: true, href: true } });
  const kind = notice ? answerKindFor(notice.type) : null;
  const requestId = notice ? answerIdFrom(notice.href) : null;
  if (!notice || !kind || !requestId) return { ok: false, error: "That request is no longer waiting." };
  try {
    if (kind === "friend") await respondToFriendRequest(userId, requestId, Boolean(accept));
    else if (kind === "parent") await respondToParentLink(userId, requestId, Boolean(accept));
    else await respondToFamilyInvite(userId, requestId, Boolean(accept));
  } catch (err) {
    const known = err instanceof SocialError || err instanceof ParentLinkError || err instanceof FamilyInviteError || err instanceof RateLimitError;
    // A request that was removed (a withdrawn friend request) reads like one already answered.
    const gone = (err as { code?: string })?.code === "P2025";
    if (!known && !gone) throw err;
    await markNotificationRead(userId, notice.id);
    return { ok: false, error: gone ? "That request is no longer waiting." : (err as Error).message };
  }
  await markNotificationRead(userId, notice.id);
  // What changes depends on the request (friends list, Parent mode, the plan form), so every signed-in screen reads fresh.
  revalidatePath("/", "layout");
  return { ok: true, state: accept ? "ACCEPTED" : "DECLINED" };
}

export async function markAllNotificationsReadAction(): Promise<void> {
  const session = await getServerAuthSession();
  if (!session?.user) return;
  await markAllNotificationsRead(session.user.id);
}

export async function markNotificationReadAction(id: string): Promise<void> {
  const session = await getServerAuthSession();
  if (!session?.user) return;
  await markNotificationRead(session.user.id, id);
}

/** A mail row tapped in the bell that opens its button's page directly: it counts as read, as opening the message would. */
export async function markMailReadAction(id: string): Promise<void> {
  const session = await getServerAuthSession();
  if (!session?.user) return;
  await openMail(session.user.id, String(id));
}

export async function dismissAnnouncementAction(announcementId: string): Promise<void> {
  const session = await getServerAuthSession();
  if (!session?.user) return;
  await dismissAnnouncement(session.user.id, announcementId);
}

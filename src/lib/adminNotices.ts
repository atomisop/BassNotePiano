import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/** What the admin's "Sent" page lists: every notice put in someone's bell, and every message put in someone's Mail (payments and billing notices live there). */
export const NOTICE_PAGE_SIZE = 40;
const MAX_FETCH = 2000;
const DAY = 86_400_000;

export type NoticeChannel = "all" | "bell" | "mail";
export type NoticeAudience = "all" | "students" | "admins";

export interface NoticeFilter {
  q: string;
  channel: NoticeChannel;
  who: NoticeAudience;
  /** Only the last N days; null for all time. */
  days: number | null;
  /** Only notices sent to this account. */
  userId: string;
  page: number;
}

export interface NoticeRow {
  id: string;
  channel: "bell" | "mail";
  at: Date;
  userId: string;
  name: string | null;
  email: string;
  isAdmin: boolean;
  kind: string;
  title: string;
  body: string | null;
  read: boolean;
}

export interface NoticeGroup {
  channel: "bell" | "mail";
  title: string;
  count: number;
  firstAt: Date;
  lastAt: Date;
}

/** "PAYMENT_PLAN_UPDATED" -> "Payment plan updated". */
export function kindLabel(kind: string): string {
  const words = kind.toLowerCase().replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function userWhere(f: NoticeFilter): Prisma.UserWhereInput {
  return f.who === "students" ? { role: { not: "ADMIN" } } : f.who === "admins" ? { role: "ADMIN" } : {};
}

function bellWhere(f: NoticeFilter): Prisma.NotificationWhereInput {
  return {
    ...(f.days !== null ? { createdAt: { gte: new Date(Date.now() - f.days * DAY) } } : {}),
    ...(f.userId ? { userId: f.userId } : {}),
    user: userWhere(f),
    ...(f.q
      ? { OR: [{ title: { contains: f.q, mode: "insensitive" } }, { body: { contains: f.q, mode: "insensitive" } }, { user: { name: { contains: f.q, mode: "insensitive" } } }, { user: { email: { contains: f.q, mode: "insensitive" } } }] }
      : {}),
  };
}

function mailWhere(f: NoticeFilter): Prisma.MailMessageWhereInput {
  return {
    ...(f.days !== null ? { createdAt: { gte: new Date(Date.now() - f.days * DAY) } } : {}),
    ...(f.userId ? { userId: f.userId } : {}),
    user: userWhere(f),
    ...(f.q
      ? { OR: [{ title: { contains: f.q, mode: "insensitive" } }, { body: { contains: f.q, mode: "insensitive" } }, { user: { name: { contains: f.q, mode: "insensitive" } } }, { user: { email: { contains: f.q, mode: "insensitive" } } }] }
      : {}),
  };
}

const person = { select: { id: true, name: true, email: true, role: true } } as const;

/** One page of notices, newest first, from the bell and Mail together. */
export async function listSentNotices(f: NoticeFilter): Promise<{ rows: NoticeRow[]; total: number }> {
  const wantBell = f.channel !== "mail";
  const wantMail = f.channel !== "bell";
  const take = Math.min(MAX_FETCH, f.page * NOTICE_PAGE_SIZE);
  const [bell, mail, bellCount, mailCount] = await Promise.all([
    wantBell ? prisma.notification.findMany({ where: bellWhere(f), orderBy: { createdAt: "desc" }, take, include: { user: person } }) : [],
    wantMail ? prisma.mailMessage.findMany({ where: mailWhere(f), orderBy: { createdAt: "desc" }, take, include: { user: person } }) : [],
    wantBell ? prisma.notification.count({ where: bellWhere(f) }) : 0,
    wantMail ? prisma.mailMessage.count({ where: mailWhere(f) }) : 0,
  ]);
  const rows: NoticeRow[] = [
    ...bell.map((n) => ({ id: n.id, channel: "bell" as const, at: n.createdAt, userId: n.userId, name: n.user.name, email: n.user.email, isAdmin: n.user.role === "ADMIN", kind: kindLabel(n.type), title: n.title, body: n.body, read: n.readAt !== null })),
    ...mail.map((m) => ({ id: m.id, channel: "mail" as const, at: m.createdAt, userId: m.userId, name: m.user.name, email: m.user.email, isAdmin: m.user.role === "ADMIN", kind: kindLabel(m.kind), title: m.title, body: m.body, read: m.readAt !== null })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());
  return { rows: rows.slice((f.page - 1) * NOTICE_PAGE_SIZE, f.page * NOTICE_PAGE_SIZE), total: bellCount + mailCount };
}

/** The same notices counted by message: each distinct title once, with how many people got it and when. */
export async function groupSentNotices(f: NoticeFilter): Promise<NoticeGroup[]> {
  const wantBell = f.channel !== "mail";
  const wantMail = f.channel !== "bell";
  const [bell, mail] = await Promise.all([
    wantBell ? prisma.notification.groupBy({ by: ["title"], where: bellWhere(f), _count: { _all: true }, _min: { createdAt: true }, _max: { createdAt: true }, orderBy: { _max: { createdAt: "desc" } }, take: 60 }) : [],
    wantMail ? prisma.mailMessage.groupBy({ by: ["title"], where: mailWhere(f), _count: { _all: true }, _min: { createdAt: true }, _max: { createdAt: true }, orderBy: { _max: { createdAt: "desc" } }, take: 60 }) : [],
  ]);
  return [
    ...bell.map((g) => ({ channel: "bell" as const, title: g.title, count: g._count._all, firstAt: g._min.createdAt!, lastAt: g._max.createdAt! })),
    ...mail.map((g) => ({ channel: "mail" as const, title: g.title, count: g._count._all, firstAt: g._min.createdAt!, lastAt: g._max.createdAt! })),
  ]
    .sort((a, b) => b.lastAt.getTime() - a.lastAt.getTime())
    .slice(0, 60);
}

// The "Notify student" switch on the studio's actions (NotifyToggle). An admin action runs its work inside withStudentNotice(notify, ...);
// with the switch off, nothing that work does reaches a student: createNotification (bell, Mail, email, push) and sendEmail both ask
// studentNoticeMutedFor() first. Admins are never muted, so the owner's own alerts and copies still arrive. The change itself still
// happens and still shows on the student's screens; only the announcement is left out.

import { AsyncLocalStorage } from "node:async_hooks";
import { prisma } from "@/lib/prisma";

const scope = new AsyncLocalStorage<{ quiet: boolean }>();

/** Runs an admin action's work, telling students about it only when `notify` is true. */
export function withStudentNotice<T>(notify: boolean, work: () => Promise<T>): Promise<T> {
  return scope.run({ quiet: !notify }, work);
}

/** True inside a quiet action. */
export function studentNoticesMuted(): boolean {
  return scope.getStore()?.quiet === true;
}

/** True when this notice must be left out: a quiet action, and the person is not an admin. Give a user id or an email address. */
export async function studentNoticeMutedFor(who: { userId?: string; email?: string }): Promise<boolean> {
  if (!studentNoticesMuted()) return false;
  const user = who.userId
    ? await prisma.user.findUnique({ where: { id: who.userId }, select: { role: true } })
    : who.email
      ? await prisma.user.findFirst({ where: { email: { equals: who.email.trim(), mode: "insensitive" } }, select: { role: true } })
      : null;
  return user?.role !== "ADMIN";
}

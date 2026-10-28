import { getAdminNavBadges } from "@/lib/admin";
import { getTeachingDay } from "@/lib/teachingToday";

// The admin's Home card: the few things that are opened many times a day, each one tap away. Rows with nothing waiting are
// left out (except Today, which is always the way to the day's classes), so the card is short when the day is quiet.

export interface AdminHomeRow {
  href: string;
  label: string;
  count: number;
}

export interface AdminHomeCounts {
  classesToday: number;
  supportChats: number;
  paymentsToReview: number;
  classesToMark: number;
  applicants: number;
}

/** The rows to show, most time-sensitive first. Pure, so it is tested without a database. */
export function adminHomeRows(c: AdminHomeCounts): AdminHomeRow[] {
  const rows: AdminHomeRow[] = [{ href: "/admin/today", label: "Classes today", count: c.classesToday }];
  const waiting: AdminHomeRow[] = [
    { href: "/admin/support", label: "Support chats open", count: c.supportChats },
    { href: "/admin/payments", label: "Payments to review", count: c.paymentsToReview },
    { href: "/admin/schedule", label: "Finished classes to mark", count: c.classesToMark },
    { href: "/admin/students", label: "Applicants waiting", count: c.applicants },
  ];
  return [...rows, ...waiting.filter((r) => r.count > 0)];
}

export async function loadAdminHomeRows(): Promise<AdminHomeRow[]> {
  const [badges, day] = await Promise.all([
    getAdminNavBadges().catch(() => ({}) as Record<string, number>),
    getTeachingDay().catch(() => null),
  ]);
  return adminHomeRows({
    classesToday: day ? day.slots.reduce((n, slot) => n + slot.students.length, 0) : 0,
    supportChats: badges["/admin/support"] ?? 0,
    paymentsToReview: badges["/admin/payments"] ?? 0,
    classesToMark: badges["/admin/schedule"] ?? 0,
    applicants: badges["/admin/students"] ?? 0,
  });
}

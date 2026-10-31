import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/auth", () => ({ getServerAuthSession: async () => null, authOptions: {} }));
import { readFileSync } from "node:fs";
import path from "node:path";
import { getCurriculumEntitlement } from "@/lib/entitlement";
import { makeUser, newTag, prisma } from "./helpers";

// Runs the real migration file against realistic rows: plans in the middle of a calendar-month cycle, as they stand today.
const tag = newTag("m28");
const users: string[] = [];
const planIds: string[] = [];
const DAY = 86_400_000;
const sql = readFileSync(path.join(process.cwd(), "prisma/migrations/20261106000000_billing_28_day_cycles/migration.sql"), "utf8");
const wordingSql = readFileSync(path.join(process.cwd(), "prisma/migrations/20261107000000_billing_notice_wording/migration.sql"), "utf8");
const statements = sql
  .split(/;\s*\n\s*\n/)
  .map((s) => s.replace(/--[^\n]*\n/g, "").trim().replace(/;$/, ""))
  .filter(Boolean);

afterAll(async () => {
  await prisma.creditGrant.deleteMany({ where: { userId: { in: users } } });
  await prisma.notification.deleteMany({ where: { userId: { in: users } } });
  await prisma.paymentPlan.deleteMany({ where: { id: { in: planIds } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
});

const iso = (d: Date) => d.toISOString();
const utc = (y: number, m: number, d: number, h = 15) => new Date(Date.UTC(y, m - 1, d, h));

async function plan(name: string, data: { status?: "ACTIVE" | "COMPLETED" | "CANCELED"; installmentsPaid: number; nextDueDate: Date; term?: "MONTHLY" | "TERM_3" }) {
  const u = await makeUser(tag, name, { classCredits: 0 });
  users.push(u.id);
  const p = await prisma.paymentPlan.create({
    data: { userId: u.id, cadence: "MIN_60_WEEKLY", term: data.term ?? "TERM_3", installmentAmountCents: 24000, creditsPerInstallment: 8, termMonths: 3, status: data.status ?? "ACTIVE", installmentsPaid: data.installmentsPaid, nextDueDate: data.nextDueDate },
  });
  planIds.push(p.id);
  return { u, p };
}
const grant = (userId: string, planId: string, expiresAt: Date, extra: { expiredAt?: Date } = {}) =>
  prisma.creditGrant.create({ data: { userId, source: "PAYMENT_PLAN_INSTALLMENT", paymentPlanId: planId, creditsGranted: 8, creditsRemaining: 8, expiresAt, ...extra } });

describe("the billing migration: existing plans move to 28-day cycles", () => {
  it("moves every kind of plan correctly, and leaves the rest alone", async () => {
    // A: active 3-month plan, first cycle paid Oct 12 15:00, due Nov 12; a free fifth-class credit was also given and ends the same moment.
    const a = await plan("Active", { installmentsPaid: 1, nextDueDate: utc(2026, 11, 12) });
    const aGrant = await grant(a.u.id, a.p.id, utc(2026, 11, 12));
    const aExtra = await grant(a.u.id, a.p.id, utc(2026, 11, 12));
    // B: Monthly plan (completed on its only payment): opened Oct 20, approved Oct 22 15:00, so the credits run to Nov 22. The plan still points at Oct 20.
    const b = await plan("Monthly", { term: "MONTHLY", status: "COMPLETED", installmentsPaid: 1, nextDueDate: utc(2026, 10, 20) });
    const bGrant = await grant(b.u.id, b.p.id, utc(2026, 11, 22));
    // C: plan that has not paid yet.
    const c = await plan("Unpaid", { installmentsPaid: 0, nextDueDate: utc(2026, 10, 24) });
    // D: completed plan whose credits already ended; E: canceled plan.
    const d = await plan("Over", { term: "MONTHLY", status: "COMPLETED", installmentsPaid: 1, nextDueDate: utc(2026, 8, 1) });
    const dGrant = await grant(d.u.id, d.p.id, utc(2026, 9, 1), { expiredAt: utc(2026, 9, 1) });
    const e = await plan("Canceled", { status: "CANCELED", installmentsPaid: 1, nextDueDate: utc(2026, 11, 12) });
    const eGrant = await grant(e.u.id, e.p.id, utc(2026, 11, 12));
    // F: a paused plan: the pause pushed its due date and credits out by 14 days together (Nov 12 became Nov 26).
    const f = await plan("Paused", { installmentsPaid: 1, nextDueDate: utc(2026, 11, 26) });
    const fGrant = await grant(f.u.id, f.p.id, utc(2026, 11, 26));
    // G: a Monthly plan that completed long ago and whose last cycle is over.

    for (const statement of statements) await prisma.$executeRawUnsafe(statement);

    const due = async (id: string) => iso((await prisma.paymentPlan.findUniqueOrThrow({ where: { id } })).nextDueDate);
    const ends = async (id: string) => iso((await prisma.creditGrant.findUniqueOrThrow({ where: { id } })).expiresAt!);

    // A: cycle began Oct 12, so it ends Nov 9 (28 days), the due date and both credits agree.
    expect(await due(a.p.id)).toBe(iso(utc(2026, 11, 9)));
    expect(await ends(aGrant.id)).toBe(iso(utc(2026, 11, 9)));
    expect(await ends(aExtra.id)).toBe(iso(utc(2026, 11, 9)));
    // B: cycle began at the approval (Oct 22 15:00): the plan now points there, and paid through Nov 19.
    expect(await due(b.p.id)).toBe(iso(utc(2026, 10, 22)));
    expect(await ends(bGrant.id)).toBe(iso(utc(2026, 11, 19)));
    // C, D, E are untouched.
    expect(await due(c.p.id)).toBe(iso(utc(2026, 10, 24)));
    expect(await due(d.p.id)).toBe(iso(utc(2026, 8, 1)));
    expect(await ends(dGrant.id)).toBe(iso(utc(2026, 9, 1)));
    expect(await due(e.p.id)).toBe(iso(utc(2026, 11, 12)));
    expect(await ends(eGrant.id)).toBe(iso(utc(2026, 11, 12)));
    // F: the pause stays in: 14 days later than an unpaused plan with the same start (Nov 9 + 14).
    expect(await due(f.p.id)).toBe(iso(utc(2026, 11, 23)));
    expect(await ends(fGrant.id)).toBe(iso(utc(2026, 11, 23)));

    // The students whose cycle changed are told, once each, in the bell. Nobody else is.
    const notified = async (id: string) => prisma.notification.count({ where: { userId: id, type: "PAYMENT_PLAN_UPDATED", title: "Your plan now bills every 4 weeks" } });
    expect(await notified(a.u.id)).toBe(1);
    expect(await notified(b.u.id)).toBe(1);
    expect(await notified(f.u.id)).toBe(1);
    expect(await notified(c.u.id)).toBe(0);
    expect(await notified(d.u.id)).toBe(0);
    expect(await notified(e.u.id)).toBe(0);
    const note = await prisma.notification.findFirstOrThrow({ where: { userId: a.u.id, type: "PAYMENT_PLAN_UPDATED" } });
    expect(note.body).toContain("next payment is due November 9");
    expect(note.body).toContain("price of each payment has not changed");
  });

  it("leaves access where the student paid for it: a plan in its last paid cycle keeps access through the new end date", async () => {
    const live = await plan("Access", { term: "MONTHLY", status: "COMPLETED", installmentsPaid: 1, nextDueDate: new Date(Date.now() - 20 * DAY) });
    await grant(live.u.id, live.p.id, new Date(Date.now() + 10 * DAY)); // 30-day month, approved 20 days ago
    for (const statement of statements) await prisma.$executeRawUnsafe(statement);
    const moved = await prisma.paymentPlan.findUniqueOrThrow({ where: { id: live.p.id } });
    const g = await prisma.creditGrant.findFirstOrThrow({ where: { paymentPlanId: live.p.id } });
    expect(g.expiresAt!.getTime() - moved.nextDueDate.getTime()).toBe(28 * DAY);
    expect((await getCurriculumEntitlement(live.u.id)).kind).toBe("PAID");
  });

  it("the follow-up migration rewords the notices already sent, and only those", async () => {
    const a = await plan("Notice", { installmentsPaid: 1, nextDueDate: utc(2026, 11, 12) });
    await grant(a.u.id, a.p.id, utc(2026, 11, 12));
    for (const statement of statements) await prisma.$executeRawUnsafe(statement);
    const other = await prisma.notification.create({ data: { userId: a.u.id, type: "PAYMENT_PLAN_UPDATED", title: "Something else", body: "Plans are now billed in 4-week cycles, so every cycle holds exactly four of your weekly class." } });
    const wording = wordingSql.replace(/--[^\n]*\n/g, "").trim().replace(/;$/, "");
    await prisma.$executeRawUnsafe(wording);
    const sent = await prisma.notification.findFirstOrThrow({ where: { userId: a.u.id, title: "Your plan now bills every 28 days" } });
    expect(sent.body).toContain("billed every 28 days, and each bill pays for exactly 4 classes.");
    expect(sent.body).toContain("next payment is due");
    expect(sent.body).not.toMatch(/4-week|4 weeks/);
    expect((await prisma.notification.findUniqueOrThrow({ where: { id: other.id } })).body).toContain("4-week cycles"); // not ours: left alone
    expect(await prisma.notification.count({ where: { userId: a.u.id, title: "Your plan now bills every 4 weeks" } })).toBe(0);
  });
});

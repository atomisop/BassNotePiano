import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/auth", () => ({ getServerAuthSession: async () => null, authOptions: {} }));
import { bookClass, nextOccurrenceDates, ClassBookingError } from "@/lib/classSchedule";
import { makeUser, newTag, prisma } from "./helpers";

/**
 * P0-SEC-02: the same slot booked by several people at the same instant, against a real Postgres.
 * The invariant that must hold: one slot is never held by two students, nobody is charged twice,
 * and a loser gets a message a person can read, not a raw database error.
 */
const tag = newTag("bkc");
const ms = (d: Date) => d.getTime();
const rows: { users: string[]; schedules: string[] } = { users: [], schedules: [] };
let slot: { id: string };

beforeAll(async () => {
  slot = await prisma.classSchedule.create({ data: { dayOfWeek: 2, startTime: "11:00", durationMin: 45, creditCost: 2, label: `${tag} Tuesday` } });
  rows.schedules.push(slot.id);
});
afterAll(async () => {
  await prisma.notification.deleteMany({ where: { userId: { in: rows.users } } });
  await prisma.classBooking.deleteMany({ where: { studentId: { in: rows.users } } });
  await prisma.user.deleteMany({ where: { id: { in: rows.users } } });
  await prisma.classSchedule.deleteMany({ where: { id: { in: rows.schedules } } });
});

async function students(n: number, label: string) {
  const out: Awaited<ReturnType<typeof makeUser>>[] = [];
  for (let i = 0; i < n; i++) {
    const u = await makeUser(tag, `${label}${i}`, { classCredits: 100 });
    rows.users.push(u.id);
    out.push(u);
  }
  return out;
}
const outcome = (r: PromiseSettledResult<unknown>) => (r.status === "fulfilled" ? "ok" : r.reason instanceof ClassBookingError ? "friendly" : `RAW:${(r.reason as { code?: string; message?: string })?.code ?? String(r.reason).slice(0, 80)}`);

describe("concurrent booking of one slot", () => {
  it("different students racing for the same time: at most one gets it, the rest are told plainly", async () => {
    const people = await students(6, "race");
    const date = nextOccurrenceDates(2, 8)[3];
    const results = await Promise.allSettled(people.map((p) => bookClass(p.id, slot.id, ms(date), 0, 2)));
    const kinds = results.map(outcome);

    const held = await prisma.classBooking.count({ where: { scheduleId: slot.id, studentId: { in: people.map((p) => p.id) }, status: "SCHEDULED" } });
    expect(held).toBeLessThanOrEqual(1);
    expect(kinds.filter((k) => k === "ok").length).toBe(held);
    // A credit is used when the class takes place, not when it is booked, so nobody's balance moves here.
    for (const p of people) {
      const u = await prisma.user.findUniqueOrThrow({ where: { id: p.id }, select: { classCredits: true } });
      expect(u.classCredits).toBe(100);
    }
    // Losers must get a readable message, never a raw database error.
    expect(kinds.filter((k) => k.startsWith("RAW"))).toEqual([]);
  });

  it("one student double-submitting the same booking: one booking, balance untouched", async () => {
    const [p] = await students(1, "dbl");
    const date = nextOccurrenceDates(2, 8)[4];
    const results = await Promise.allSettled([1, 2, 3, 4, 5].map(() => bookClass(p.id, slot.id, ms(date), 0, 2)));
    const kinds = results.map(outcome);
    const count = await prisma.classBooking.count({ where: { studentId: p.id, status: "SCHEDULED" } });
    const u = await prisma.user.findUniqueOrThrow({ where: { id: p.id }, select: { classCredits: true } });
    expect(count).toBe(1);
    expect(u.classCredits).toBe(100);
    expect(kinds.filter((k) => k === "ok")).toHaveLength(1);
    expect(kinds.filter((k) => k.startsWith("RAW"))).toEqual([]);
  });
});

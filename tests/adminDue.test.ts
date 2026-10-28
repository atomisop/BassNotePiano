import { describe, expect, it } from "vitest";
import { buildDueWeek, easternDayKey } from "@/lib/adminDue";

const NOW = new Date("2026-10-28T18:00:00Z"); // Wed Oct 28, 2:00 PM Eastern
const plan = (userId: string, name: string, iso: string, amountCents = 19999) => ({ userId, name, amountCents, nextDueDate: new Date(iso) });

describe("buildDueWeek", () => {
  it("makes seven Eastern days starting today", () => {
    const week = buildDueWeek([], NOW);
    expect(week.days).toHaveLength(7);
    expect(week.days[0]).toMatchObject({ weekday: "Wed", dayOfMonth: "28", isToday: true });
    expect(week.days[6]).toMatchObject({ weekday: "Tue", dayOfMonth: "3", isToday: false });
  });

  it("puts each coming bill on its day with who and how much", () => {
    const week = buildDueWeek([plan("a", "Ana Cole", "2026-10-29T15:00:00Z"), plan("b", "Ben Ode", "2026-10-29T20:00:00Z", 17999), plan("c", "Cy Lin", "2026-11-02T15:00:00Z")], NOW);
    const thu = week.days.find((d) => d.weekday === "Thu")!;
    expect(thu).toMatchObject({ count: 2, cents: 19999 + 17999 });
    expect(week.items.map((i) => i.name)).toEqual(["Ana Cole", "Ben Ode", "Cy Lin"]);
    expect(week.totalCents).toBe(19999 + 17999 + 19999);
  });

  it("leaves out bills more than 7 days away and lists past-due ones separately, longest late first", () => {
    const week = buildDueWeek([plan("a", "Far Off", "2026-11-20T15:00:00Z"), plan("b", "Late Two", "2026-10-26T15:00:00Z"), plan("c", "Late Six", "2026-10-22T15:00:00Z")], NOW);
    expect(week.items).toHaveLength(0);
    expect(week.overdue.map((o) => [o.name, o.daysLate])).toEqual([["Late Six", 6], ["Late Two", 2]]);
  });

  it("counts a bill due late tonight on today's Eastern day, not tomorrow's", () => {
    expect(easternDayKey(new Date("2026-10-29T02:30:00Z"))).toBe("2026-10-28");
    const week = buildDueWeek([plan("a", "Night Owl", "2026-10-29T02:30:00Z")], NOW);
    expect(week.days[0].count).toBe(1);
  });
});

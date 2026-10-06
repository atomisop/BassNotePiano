import { describe, expect, it } from "vitest";
import { GET as billReminder } from "@/app/api/reminders/installment/route";
import { GET as classCalendar } from "@/app/api/calendar/class/route";

describe("bill reminder file", () => {
  it("returns a calendar file for a valid due date and amount", async () => {
    const res = await billReminder(new Request("https://x/api/reminders/installment?d=2026-11-05&a=17999"));
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("DTSTART;VALUE=DATE:20261105");
    expect(text).toContain("$179.99");
  });
  it("rejects anything else", async () => {
    for (const q of ["d=garbage&a=5", "d=2026-11-05&a=-1", "d=2026-11-05&a=abc", "a=100"]) {
      expect((await billReminder(new Request(`https://x/api/reminders/installment?${q}`))).status).toBe(400);
    }
  });
});

describe("class calendar file", () => {
  it("builds an event from a start time and a length", async () => {
    const res = await classCalendar(new Request("https://x/api/calendar/class?s=2026-11-05T17:00:00.000Z&m=45"));
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("DTSTART:20261105T170000Z");
    expect(text).toContain("DTEND:20261105T174500Z");
  });
  it("rejects a bad time or length", async () => {
    expect((await classCalendar(new Request("https://x/api/calendar/class?s=nope&m=45"))).status).toBe(400);
    expect((await classCalendar(new Request("https://x/api/calendar/class?s=2026-11-05T17:00:00.000Z&m=9999"))).status).toBe(400);
  });
});

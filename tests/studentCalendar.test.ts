import { beforeAll, describe, expect, it } from "vitest";
import { buildStudentIcs, isValidStudentCalendarToken, studentCalendarToken, studentCalendarUrls } from "@/lib/studentCalendar";

beforeAll(() => {
  process.env.NEXTAUTH_SECRET = "test-secret";
});

describe("student calendar token", () => {
  it("is tied to the account and the version", () => {
    const t = studentCalendarToken("user1", 0);
    expect(isValidStudentCalendarToken("user1", 0, t)).toBe(true);
    expect(isValidStudentCalendarToken("user2", 0, t)).toBe(false);
    expect(isValidStudentCalendarToken("user1", 1, t)).toBe(false);
    expect(isValidStudentCalendarToken("user1", 0, "")).toBe(false);
    expect(isValidStudentCalendarToken("user1", 0, t.slice(0, -1))).toBe(false);
  });
  it("builds https and webcal links that carry the same token", () => {
    const { https, webcal } = studentCalendarUrls("user1", 3, "https://bassnotepiano.com/");
    expect(https.startsWith("https://bassnotepiano.com/api/calendar/me?u=user1&t=")).toBe(true);
    expect(webcal.startsWith("webcal://bassnotepiano.com/api/calendar/me?u=user1&t=")).toBe(true);
    expect(https.split("t=")[1]).toBe(webcal.split("t=")[1]);
  });
});

describe("buildStudentIcs", () => {
  it("writes one event per class with a reminder and CRLF line ends", () => {
    const ics = buildStudentIcs([{ id: "b1", scheduledAt: new Date("2026-11-05T17:00:00Z"), minutes: 45 }], "https://discord.gg/x", new Date("2026-11-01T00:00:00Z"));
    expect(ics).toContain("UID:b1@bassnotepiano.com");
    expect(ics).toContain("DTSTART:20261105T170000Z");
    expect(ics).toContain("DTEND:20261105T174500Z");
    expect(ics).toContain("TRIGGER:-PT15M");
    expect(ics.split("\r\n").length).toBeGreaterThan(10);
    expect(ics.endsWith("\r\n")).toBe(true);
  });
  it("is a valid empty calendar with no classes", () => {
    const ics = buildStudentIcs([], "https://discord.gg/x", new Date());
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).not.toContain("BEGIN:VEVENT");
  });
});

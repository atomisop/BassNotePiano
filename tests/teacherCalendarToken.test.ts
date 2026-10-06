import { beforeAll, describe, expect, it } from "vitest";
import { isValidTeacherCalendarToken, teacherCalendarToken } from "@/lib/teacherCalendar";

beforeAll(() => {
  process.env.NEXTAUTH_SECRET = "test-secret";
});

describe("teacher calendar token", () => {
  it("accepts its own token and nothing else", () => {
    expect(isValidTeacherCalendarToken(teacherCalendarToken())).toBe(true);
    expect(isValidTeacherCalendarToken("")).toBe(false);
    expect(isValidTeacherCalendarToken("x".repeat(40))).toBe(false);
  });
});

import { isValidTeacherCalendarToken, teacherCalendarToken } from "@/lib/teacherCalendar";

export function isTeacherTokenForVersionTest(): boolean {
  process.env.NEXTAUTH_SECRET = "test-secret-for-audit-fixes";
  const v0 = teacherCalendarToken();
  const v1 = teacherCalendarToken(1);
  return v0 === teacherCalendarToken(0) && v0 !== v1 && isValidTeacherCalendarToken(v1, 1) && !isValidTeacherCalendarToken(v0, 1) && !isValidTeacherCalendarToken(v1, 0);
}

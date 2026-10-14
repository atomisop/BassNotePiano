import { afterAll, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/auth", () => ({ getServerSession: async () => null, getServerAuthSession: async () => null, authOptions: {} }));
import { canonicalEmail } from "@/lib/canonicalEmail";
import { etDayKey } from "@/lib/fingerPractice";
import { recentDayKeys } from "@/lib/practiceActivityRules";
import { getDoneLast7ByUser, getStudentPracticeDetail } from "@/lib/practiceActivity";
import { newTag, prisma } from "./helpers";

const tag = newTag("pa");
const userIds: string[] = [];

async function student(label: string) {
  const email = `${tag}-${label}@example.test`;
  const u = await prisma.user.create({ data: { email, name: label, passwordHash: "x", emailCanonical: canonicalEmail(email) } });
  userIds.push(u.id);
  return u;
}

afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});

describe("practice activity for the teacher", () => {
  it("counts full days in the last 7 per student and shows the 30 day strip", async () => {
    const days = recentDayKeys(etDayKey(), 30);
    const busy = await student("busy");
    const idle = await student("idle");
    const part = await student("part");
    // busy: the last 3 days done; one old day outside the week; idle: nothing; part: today partial only
    for (const day of [days[29], days[28], days[27], days[5]]) {
      await prisma.fingerPracticeDay.create({ data: { userId: busy.id, day, seconds: 600, completedAt: new Date() } });
    }
    await prisma.fingerPracticeDay.create({ data: { userId: part.id, day: days[29], seconds: 240 } });

    const counts = await getDoneLast7ByUser([busy.id, idle.id, part.id]);
    expect(counts.get(busy.id)).toBe(3);
    expect(counts.get(idle.id) ?? 0).toBe(0);
    expect(counts.get(part.id) ?? 0).toBe(0);

    const detail = await getStudentPracticeDetail(busy.id);
    expect(detail.strip).toHaveLength(30);
    expect(detail.doneLast7).toBe(3);
    expect(detail.doneLast30).toBe(4);
    expect(detail.streak).toBe(3);
    expect(detail.lastDoneDay).toBe(days[29]);

    const partial = await getStudentPracticeDetail(part.id);
    expect(partial.strip[29].state).toBe("partial");
    expect(partial.lastDoneDay).toBeNull();
    expect(partial.minutesLast7).toBe(4);
  });

  it("returns an empty map without asking the database for no one", async () => {
    expect((await getDoneLast7ByUser([])).size).toBe(0);
  });
});

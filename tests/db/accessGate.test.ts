import { afterAll, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/auth", () => ({ getServerAuthSession: async () => null, authOptions: {} }));
import { AccessDeniedError, canAccessScale, decideScaleAccess, getRoadmap, lockScaleForUser, markModuleRead, markPracticeCompleted, recordQuizAttempt, unlockScaleForUser } from "@/lib/access";
import { makeUser, newTag, prisma } from "./helpers";

const tag = newTag("ac");
const ids: string[] = [];
let n = 0;
const user = async (extra: Record<string, unknown>) => {
  const u = await makeUser(`${tag}${n++}`, "Access Tester", extra);
  ids.push(u.id);
  return u;
};

afterAll(async () => {
  await prisma.quizAttempt.deleteMany({ where: { userId: { in: ids } } });
  await prisma.scaleProgress.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
});

describe("decideScaleAccess", () => {
  const first = { slug: "major-scale", order: 0 };
  const later = { slug: "natural-minor", order: 1 };
  it("an admin opens everything", () => expect(decideScaleAccess("ADMIN", later, { approved: false }).canAccess).toBe(true));
  it("full access opens the first scale and only approved later ones", () => {
    for (const kind of ["PAID", "COMPED"] as const) {
      expect(decideScaleAccess(kind, first, { approved: false }).canAccess).toBe(true);
      expect(decideScaleAccess(kind, later, { approved: false })).toMatchObject({ canAccess: false, lockedBecause: "not-yet-approved" });
      expect(decideScaleAccess(kind, later, { approved: true }).canAccess).toBe(true);
    }
  });
  it("a trial opens only the trial scale", () => {
    expect(decideScaleAccess("TRIAL", first, { approved: false }).reason).toBe("trial");
    expect(decideScaleAccess("TRIAL", later, { approved: true })).toMatchObject({ canAccess: false, lockedBecause: "no-plan" });
  });
  it("no access opens nothing, even a scale that was approved before the plan lapsed", () => {
    expect(decideScaleAccess("NONE", first, { approved: true })).toMatchObject({ canAccess: false, lockedBecause: "no-plan" });
  });
});

describe("the real gate", () => {
  it("a student with no access can open nothing and cannot change progress", async () => {
    const u = await user({});
    const roadmap = await getRoadmap(u.id);
    expect(roadmap.length).toBeGreaterThan(1);
    expect(roadmap.every((s) => !s.canAccess)).toBe(true);
    await expect(markModuleRead(u.id, roadmap[0].scaleGroup.slug)).rejects.toBeInstanceOf(AccessDeniedError);
    expect(await prisma.scaleProgress.count({ where: { userId: u.id } })).toBe(0);
  });

  it("a student with access opens the first scale; the next stays shut until unlocked, and locking shuts it again", async () => {
    const u = await user({ hasCurriculumAccess: true });
    const [first, second] = (await getRoadmap(u.id)).map((s) => s.scaleGroup.slug);
    expect((await canAccessScale(u.id, first))?.canAccess).toBe(true);
    expect((await canAccessScale(u.id, second))?.canAccess).toBe(false);
    await expect(markModuleRead(u.id, second)).rejects.toBeInstanceOf(AccessDeniedError);

    await unlockScaleForUser(u.id, second);
    expect((await canAccessScale(u.id, second))?.canAccess).toBe(true);
    const again = await unlockScaleForUser(u.id, second); // unlocking twice keeps the first date
    expect(again.unlockedAt).not.toBeNull();

    await lockScaleForUser(u.id, second);
    expect((await canAccessScale(u.id, second))?.canAccess).toBe(false);
  });

  it("completes a scale only when the module, practice and quiz are all done, and a failed quiz does not count", async () => {
    const u = await user({ hasCurriculumAccess: true });
    const slug = (await getRoadmap(u.id))[0].scaleGroup.slug;
    expect((await markModuleRead(u.id, slug)).status).toBe("IN_PROGRESS");
    expect((await markPracticeCompleted(u.id, slug)).status).toBe("IN_PROGRESS");

    const failed = await recordQuizAttempt(u.id, slug, { score: 1, totalQuestions: 10, answers: [] });
    expect(failed.passed).toBe(false);
    expect(failed.progress.status).toBe("IN_PROGRESS");

    const passed = await recordQuizAttempt(u.id, slug, { score: 10, totalQuestions: 10, answers: [] });
    expect(passed.passed).toBe(true);
    expect(passed.progress.status).toBe("COMPLETED");
    expect(passed.progress.completedAt).not.toBeNull();
    expect(await prisma.quizAttempt.count({ where: { userId: u.id } })).toBe(2);
  });

  it("a trial student can read the first scale but not log practice or take the quiz", async () => {
    const u = await user({ trialEndsAt: new Date(Date.now() + 86_400_000) });
    const slug = (await getRoadmap(u.id))[0].scaleGroup.slug;
    await expect(markPracticeCompleted(u.id, slug)).rejects.toBeInstanceOf(AccessDeniedError);
    await expect(recordQuizAttempt(u.id, slug, { score: 10, totalQuestions: 10, answers: [] })).rejects.toBeInstanceOf(AccessDeniedError);
  });
});

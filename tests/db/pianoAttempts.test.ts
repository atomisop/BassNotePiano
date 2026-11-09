import { afterAll, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/auth", () => ({ getServerAuthSession: async () => null, authOptions: {} }));
import { getPianoBest, MAX_SAVES_PER_HOUR, PianoAttemptError, recordPianoAttempt } from "@/lib/piano/attempts";
import { makeUser, newTag, prisma } from "./helpers";

const tag = newTag("pa");
const users: string[] = [];
const good = (key: string, extra: Record<string, unknown> = {}) => ({ exerciseId: "pentatonic-warm-up", mode: "guided", attempts: 7, correct: 6, clientKey: key, ...extra });
async function person(name: string) {
  const u = await makeUser(tag, name);
  users.push(u.id);
  return u;
}
afterAll(async () => {
  await prisma.pianoPracticeAttempt.deleteMany({ where: { userId: { in: users } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
});

describe("saving a piano run (P1-MUS-06)", () => {
  it("saves a finished run and works accuracy out on the server", async () => {
    const u = await person("save");
    expect(await recordPianoAttempt(u.id, good("key-0001-abc"))).toEqual({ saved: true, accuracy: 86 });
    expect(await getPianoBest(u.id, "pentatonic-warm-up")).toEqual({ bestAccuracy: 86, runs: 1 });
  });

  it("the same clientKey counts once, so a retry or double tap cannot add a run", async () => {
    const u = await person("idem");
    await recordPianoAttempt(u.id, good("key-idem-0001"));
    const again = await recordPianoAttempt(u.id, good("key-idem-0001"));
    expect(again.saved).toBe(false);
    const results = await Promise.all([1, 2, 3, 4].map(() => recordPianoAttempt(u.id, good("key-idem-0002")).catch((e) => e)));
    expect(results.filter((r) => r instanceof Error)).toEqual([]);
    expect((await getPianoBest(u.id, "pentatonic-warm-up")).runs).toBe(2);
  });

  it("refuses a run that could not have happened", async () => {
    const u = await person("bad");
    const refuse = (input: Record<string, unknown>) => expect(recordPianoAttempt(u.id, good("key-bad-00001", input) as never)).rejects.toBeInstanceOf(PianoAttemptError);
    await refuse({ correct: 5 }); // did not reach the last note
    await refuse({ correct: 7, attempts: 9 }); // more correct than the exercise has notes
    await refuse({ attempts: 3 }); // fewer attempts than notes
    await refuse({ attempts: 100_000 });
    await refuse({ attempts: 7.5 });
    await refuse({ attempts: Number.NaN });
    await refuse({ exerciseId: "made-up" });
    await refuse({ mode: "cheat" });
    await refuse({ clientKey: "short" });
    expect((await getPianoBest(u.id, "pentatonic-warm-up")).runs).toBe(0);
  });

  it("limits how many runs one person can save in an hour", async () => {
    const u = await person("limit");
    for (let i = 0; i < MAX_SAVES_PER_HOUR; i++) await recordPianoAttempt(u.id, good(`key-limit-${String(i).padStart(4, "0")}`));
    await expect(recordPianoAttempt(u.id, good("key-limit-over1"))).rejects.toBeInstanceOf(PianoAttemptError);
  });

  it("keeps one person's runs and best apart from another's, and keeps the best of several", async () => {
    const a = await person("a");
    const b = await person("b");
    await recordPianoAttempt(a.id, good("key-a-000001", { attempts: 12 })); // 50%
    await recordPianoAttempt(a.id, good("key-a-000002", { attempts: 6 })); // 100%
    await recordPianoAttempt(b.id, good("key-b-000001", { attempts: 8 })); // 75%
    expect(await getPianoBest(a.id, "pentatonic-warm-up")).toEqual({ bestAccuracy: 100, runs: 2 });
    expect(await getPianoBest(b.id, "pentatonic-warm-up")).toEqual({ bestAccuracy: 75, runs: 1 });
  });

  it("is removed with the account", async () => {
    const u = await person("gone");
    await recordPianoAttempt(u.id, good("key-gone-0001"));
    await prisma.user.delete({ where: { id: u.id } });
    expect(await prisma.pianoPracticeAttempt.count({ where: { userId: u.id } })).toBe(0);
  });
});

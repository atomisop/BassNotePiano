import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/auth", () => ({ getServerAuthSession: async () => null, authOptions: {} }));
import { runDiscordClassChannels } from "../../netlify/functions/discord-class-channels";
import { runJob } from "@/lib/jobRun";
import { resetSetting, saveSetting } from "@/lib/siteSettings";
import { TEST_CHANNEL_KEY } from "@/lib/discordApi";
import { OWNER_EMAIL } from "@/lib/adminNotifications";
import { makeUser, newTag, prisma } from "./helpers";

// The Discord job runs every minute. Almost every run finds nothing to do, so it must cost almost nothing then (2026-11-11), and
// it must still do the whole job the moment a class is near, a call is open, or the test call is waiting.

const tag = newTag("di");
const MIN = 60_000;
const HOUR = 3_600_000;
const queries: string[] = [];
let stu: { id: string }, slot: { id: string };
// The owner has a connected Discord account, as in production: the old job asked Discord about it on every run, class or no class.
let ownerMade: string | null = null;
let ownerBefore: { id: string; discordId: string | null } | null = null;
let day = 0;
const fetchMock = vi.fn(async (_url: unknown, init?: { method?: string }) =>
  init?.method === "DELETE" ? new Response(null, { status: 204 }) : new Response("{}", { status: 404 }),
);

const book = (minutesFromNow: number, extra: Record<string, unknown> = {}) =>
  prisma.classBooking.create({
    data: {
      studentId: stu.id,
      scheduleId: slot.id,
      occurrenceDate: new Date(Date.UTC(2032, 0, ++day)),
      scheduledAt: new Date(Date.now() + minutesFromNow * MIN),
      creditsSpent: 2,
      ...extra,
    },
  });

/** Runs the job and returns what it did, plus every database call it made. */
async function run() {
  queries.length = 0;
  const result = (await runDiscordClassChannels()) as { statusCode: number; body?: string };
  return { result, queries: [...queries] };
}

beforeAll(async () => {
  process.env.DISCORD_BOT_TOKEN = "test-token";
  vi.stubGlobal("fetch", fetchMock);
  prisma.$use(async (params, next) => {
    queries.push(`${params.model}.${params.action}`);
    return next(params);
  });
  stu = await makeUser(tag, "Discord Dan", { discordId: `d-${tag}` });
  ownerBefore = await prisma.user.findUnique({ where: { email: OWNER_EMAIL }, select: { id: true, discordId: true } });
  if (ownerBefore) await prisma.user.update({ where: { id: ownerBefore.id }, data: { discordId: `o-${tag}` } });
  else ownerMade = (await prisma.user.create({ data: { email: OWNER_EMAIL, name: "Owner", passwordHash: "x", role: "ADMIN", discordId: `o-${tag}` } })).id;
  slot = await prisma.classSchedule.create({ data: { dayOfWeek: 3, startTime: "10:00", durationMin: 45, creditCost: 2, label: `${tag} slot` } });
});

afterEach(async () => {
  fetchMock.mockClear();
  await prisma.classBooking.deleteMany({ where: { studentId: stu.id } });
  await prisma.appSetting.deleteMany({ where: { OR: [{ key: TEST_CHANNEL_KEY }, { key: { startsWith: "discord_notice:" } }] } });
  await resetSetting("discord.enabled");
});

afterAll(async () => {
  vi.unstubAllGlobals();
  await prisma.notification.deleteMany({ where: { userId: stu.id } });
  if (ownerMade) await prisma.user.deleteMany({ where: { id: ownerMade } });
  else if (ownerBefore) await prisma.user.update({ where: { id: ownerBefore.id }, data: { discordId: ownerBefore.discordId } });
  await prisma.classSchedule.deleteMany({ where: { id: slot.id } });
  await prisma.user.deleteMany({ where: { id: stu.id } });
  await prisma.jobRun.deleteMany({ where: { name: { in: ["discord-class-channels", `${tag}-quiet`] } } });
});

describe("the every-minute Discord job when there is nothing to do", () => {
  it("stops after the quick check: no Discord request, no owner lookup, no cleanup write", async () => {
    const { result, queries: made } = await run();
    expect(result.body).toBe("idle");
    expect(fetchMock).not.toHaveBeenCalled();
    for (const heavy of ["User.findFirst", "ClassBooking.findMany", "AppSetting.deleteMany", "AppSetting.upsert"]) expect(made).not.toContain(heavy);
    // Pause check, settings, the two "is anything open" probes, the "is a class near" probe, and at most one run-row read or write.
    expect(made.length).toBeLessThanOrEqual(7);
  });

  it("stays idle when the next class is further away than the open window", async () => {
    await book(30); // opens 5 minutes before by default
    const { result } = await run();
    expect(result.body).toBe("idle");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("stays idle for an in-person class, which has no call", async () => {
    await book(3, { inPerson: true });
    const { result } = await run();
    expect(result.body).toBe("idle");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("stays idle when the owner turned class calls off, even with a class about to start, and turns back on", async () => {
    await book(3);
    await saveSetting("discord.enabled", false);
    const off = await run();
    expect(off.result.body).toBe("idle");
    expect(fetchMock).not.toHaveBeenCalled();

    await saveSetting("discord.enabled", true);
    await run();
    expect(fetchMock).toHaveBeenCalled(); // back on: it looks for the student in the server again
  });
});

describe("the same job when there is work", () => {
  it("does the whole run when a class is about to start", async () => {
    await book(3);
    const { queries: made } = await run();
    expect(made).toContain("ClassBooking.findMany");
    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.includes(`/members/d-${tag}`))).toBe(true);
  });

  it("removes the call of a class that is over, and says it changed something", async () => {
    await book(-3 * 60, { discordChannelId: `chan-${tag}` });
    const { result } = await run();
    expect(result.body).toBe("changed");
    const deleted = fetchMock.mock.calls.filter((c) => (c[1] as { method?: string } | undefined)?.method === "DELETE").map((c) => String(c[0]));
    expect(deleted.some((u) => u.endsWith(`/channels/chan-${tag}`))).toBe(true);
    expect((await prisma.classBooking.findFirstOrThrow({ where: { studentId: stu.id } })).discordChannelId).toBeNull();
  });

  it("keeps watching a call that is still open (people are moved into it), without removing it", async () => {
    await book(-10, { discordChannelId: `chan-${tag}` }); // started 10 minutes ago
    const { result, queries: made } = await run();
    expect(result.body).toBe("idle");
    expect(made).toContain("ClassBooking.findMany"); // not the quick exit: the move step ran
    expect((await prisma.classBooking.findFirstOrThrow({ where: { studentId: stu.id } })).discordChannelId).toBe(`chan-${tag}`);
  });

  it("removes the owner's test call once its time is up", async () => {
    await prisma.appSetting.create({ data: { key: TEST_CHANNEL_KEY, value: `test-chan-${tag}|${Date.now() - MIN}` } });
    const { result } = await run();
    expect(result.body).toBe("changed");
    expect(await prisma.appSetting.findUnique({ where: { key: TEST_CHANNEL_KEY } })).toBeNull();
  });
});

describe("runJob's quiet runs", () => {
  const name = `${tag}-quiet`;
  const quiet = { quietWhen: () => true };

  it("writes one row, then skips even the check for a recent row on this server", async () => {
    await runJob(name, async () => ({ body: "idle" }), quiet);
    queries.length = 0;
    await runJob(name, async () => ({ body: "idle" }), quiet);
    await runJob(name, async () => ({ body: "idle" }), quiet);
    expect(queries.filter((q) => q.startsWith("JobRun."))).toEqual([]);
    expect(await prisma.jobRun.count({ where: { name } })).toBe(1);
  });

  it("looks again after a failure, so a failed run is never hidden behind an old stamp", async () => {
    await expect(
      runJob(
        name,
        async () => {
          throw new Error("boom");
        },
        quiet,
      ),
    ).rejects.toThrow("boom");
    queries.length = 0;
    await runJob(name, async () => ({ body: "idle" }), quiet);
    expect(queries).toContain("JobRun.findFirst");
    expect((await prisma.jobRun.findFirstOrThrow({ where: { name }, orderBy: { ranAt: "desc" } })).ok).toBe(false);
  });
});

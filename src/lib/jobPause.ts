import { prisma } from "@/lib/prisma";

// Pausing an automatic task: the owner can stop one job from running until they resume it. A paused job's scheduled run still arrives
// from Netlify, but `runJob` sees the pause and does nothing (so nothing is half done), and the status list shows "paused" instead of
// calling it late. The catch-up never runs a paused job either. Stored as one AppSetting row per paused job.

const PREFIX = "job-paused:";

export const pauseKey = (name: string) => `${PREFIX}${name}`;

export async function pausedJobNames(): Promise<Set<string>> {
  const rows = await prisma.appSetting.findMany({ where: { key: { startsWith: PREFIX } }, select: { key: true } });
  return new Set(rows.map((r) => r.key.slice(PREFIX.length)));
}

export async function isJobPaused(name: string): Promise<boolean> {
  return Boolean(await prisma.appSetting.findUnique({ where: { key: pauseKey(name) }, select: { key: true } }));
}

export async function setJobPaused(name: string, paused: boolean, byEmail: string): Promise<void> {
  if (paused) {
    await prisma.appSetting.upsert({
      where: { key: pauseKey(name) },
      create: { key: pauseKey(name), value: `${new Date().toISOString()} by ${byEmail}` },
      update: {},
    });
  } else {
    await prisma.appSetting.deleteMany({ where: { key: pauseKey(name) } });
  }
}

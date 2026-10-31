import { afterAll, describe, expect, it } from "vitest";
import { getJobStatuses } from "@/lib/jobRun";
import { prisma } from "./helpers";

// Far in the future so these rows are each job's latest, whatever else the test database holds.
const T = new Date("2032-06-01T12:00:00Z");
const ids: string[] = [];

afterAll(async () => {
  await prisma.jobRun.deleteMany({ where: { id: { in: ids } } });
});

describe("getJobStatuses (one query for every job's latest run)", () => {
  it("reads each job's newest run, its result and its note", async () => {
    const rows = [
      { name: "credit-expiry", ranAt: new Date(T.getTime() - 3_600_000), ok: false, note: "older failure" },
      { name: "credit-expiry", ranAt: T, ok: true, note: null },
      { name: "db-backup", ranAt: new Date(T.getTime() - 60_000), ok: false, note: "disk full" },
    ];
    for (const r of rows) ids.push((await prisma.jobRun.create({ data: r })).id);

    const statuses = await getJobStatuses(new Date(T.getTime() + 60_000));
    const credit = statuses.find((s) => s.name === "credit-expiry")!;
    const backup = statuses.find((s) => s.name === "db-backup")!;
    expect(credit.lastRanAt?.toISOString()).toBe(T.toISOString());
    expect(credit.state).toBe("ok");
    expect(backup.state).toBe("failed");
    expect(backup.note).toBe("disk full");
    // Every watched job is reported, with or without runs.
    expect(statuses.length).toBeGreaterThanOrEqual(14);
  });
});

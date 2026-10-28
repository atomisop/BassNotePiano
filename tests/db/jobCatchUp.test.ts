import { afterAll, describe, expect, it } from "vitest";
import { runCatchUps } from "@/lib/jobCatchUp";
import { prisma } from "./helpers";

// A made-up day far in the future, so any real job runs in the test database are older than its slots.
const NOW = new Date("2031-03-05T19:00:00Z");

afterAll(async () => {
  await prisma.appSetting.deleteMany({ where: { key: { startsWith: "catch-up:" }, AND: { key: { contains: ":2031-03-05" } } } });
});

describe("runCatchUps", () => {
  it("runs each missed daily job once, in order, and never twice for the same missed slot", async () => {
    const calls: string[] = [];
    const runners = {
      "credit-expiry": async () => void calls.push("credit-expiry"),
      "payment-plan-reservations": async () => void calls.push("payment-plan-reservations"),
      "admin-daily-summary": async () => void calls.push("admin-daily-summary"),
      "auto-approvals": async () => void calls.push("auto-approvals"),
      "mail-chain-probe": async () => void calls.push("mail-chain-probe"),
    };
    const first = await runCatchUps(runners, NOW);
    expect(first).toEqual(["credit-expiry", "payment-plan-reservations", "admin-daily-summary", "auto-approvals", "mail-chain-probe"]);
    expect(calls).toEqual(first);

    // A second pass (an overlapping run, or ten minutes later with the runners not having recorded anything) claims nothing.
    const second = await runCatchUps(runners, new Date(NOW.getTime() + 10 * 60_000));
    expect(second).toEqual([]);
    expect(calls).toHaveLength(5);
  });

  it("does not retry a late run that failed (the failure is recorded for the owner, not hammered)", async () => {
    const later = new Date("2031-03-06T19:00:00Z");
    let attempts = 0;
    const runners = {
      "credit-expiry": async () => {
        attempts++;
        throw new Error("boom");
      },
      "payment-plan-reservations": async () => undefined,
      "admin-daily-summary": async () => undefined,
      "auto-approvals": async () => undefined,
      "mail-chain-probe": async () => undefined,
    };
    await runCatchUps(runners, later);
    await runCatchUps(runners, new Date(later.getTime() + 10 * 60_000));
    expect(attempts).toBe(1);
    await prisma.appSetting.deleteMany({ where: { key: { contains: ":2031-03-06" } } });
  });
});

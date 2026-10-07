import { describe, expect, it } from "vitest";
import { describeAge, pipelineStatus, QUIET_AFTER_HOURS } from "@/lib/paymentPipelineStatus";

const NOW = new Date("2026-10-07T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000);

describe("pipelineStatus", () => {
  it("is fine when emails are arriving, even with payments waiting", () => {
    expect(pipelineStatus({ lastEmailAt: hoursAgo(3), waitingPayments: 4, now: NOW }).status).toBe("ok");
    expect(pipelineStatus({ lastEmailAt: hoursAgo(QUIET_AFTER_HOURS - 1), waitingPayments: 1, now: NOW }).status).toBe("ok");
  });
  it("is fine when it is quiet and nothing is waiting (nobody paid, so no email is expected)", () => {
    expect(pipelineStatus({ lastEmailAt: hoursAgo(500), waitingPayments: 0, now: NOW }).status).toBe("ok");
    expect(pipelineStatus({ lastEmailAt: null, waitingPayments: 0, now: NOW }).status).toBe("ok");
  });
  it("is quiet after two days of silence while payments are waiting", () => {
    expect(pipelineStatus({ lastEmailAt: hoursAgo(QUIET_AFTER_HOURS), waitingPayments: 1, now: NOW }).status).toBe("quiet");
    expect(pipelineStatus({ lastEmailAt: hoursAgo(200), waitingPayments: 2, now: NOW }).status).toBe("quiet");
  });
  it("counts an email that never arrived as silence", () => {
    expect(pipelineStatus({ lastEmailAt: null, waitingPayments: 1, now: NOW })).toEqual({ status: "quiet", hoursSinceEmail: null });
  });
  it("reports whole hours since the last email", () => {
    expect(pipelineStatus({ lastEmailAt: hoursAgo(5), waitingPayments: 0, now: NOW }).hoursSinceEmail).toBe(5);
  });
});

describe("describeAge", () => {
  it("reads naturally", () => {
    expect(describeAge(null)).toBe("never");
    expect(describeAge(0)).toBe("less than an hour ago");
    expect(describeAge(1)).toBe("1 hour ago");
    expect(describeAge(30)).toBe("30 hours ago");
    expect(describeAge(72)).toBe("3 days ago");
  });
});

import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { PROBE_GRACE_MINUTES, mailChainProblem, newProbeToken } from "@/lib/mailProbe";

const now = new Date("2026-10-09T15:00:00Z");
const minutesAgo = (m: number) => new Date(now.getTime() - m * 60_000);

describe("mailChainProblem", () => {
  it("is quiet when nothing was sent yet", () => {
    expect(mailChainProblem({ sentAt: null, received: false, now })).toBeNull();
  });
  it("is quiet when the test email arrived", () => {
    expect(mailChainProblem({ sentAt: minutesAgo(600), received: true, now })).toBeNull();
  });
  it("gives a test email time to travel the chain", () => {
    expect(mailChainProblem({ sentAt: minutesAgo(PROBE_GRACE_MINUTES - 1), received: false, now })).toBeNull();
  });
  it("names the links to check once a test email is lost", () => {
    const problem = mailChainProblem({ sentAt: minutesAgo(180), received: false, now });
    expect(problem).toContain("3 hours ago");
    expect(problem).toContain("Squarespace");
    expect(problem).toContain("Gmail");
    expect(problem).toContain("Mailgun");
  });
  it("says minutes just after the grace period", () => {
    expect(mailChainProblem({ sentAt: minutesAgo(50), received: false, now })).toContain("50 minutes ago");
  });
});

describe("newProbeToken", () => {
  it("is 24 hex characters and different each time", () => {
    const a = newProbeToken();
    expect(a).toMatch(/^[0-9a-f]{24}$/);
    expect(newProbeToken()).not.toBe(a);
  });
});

import { describe, expect, it } from "vitest";
import { SLOW_PAYMENT_MINUTES, describePaymentWait } from "@/lib/paymentWait";

const now = new Date("2026-10-09T15:00:00Z");
const ago = (m: number) => new Date(now.getTime() - m * 60_000);

describe("describePaymentWait", () => {
  it("promises an email and gives the usual time while it is fresh", () => {
    const n = describePaymentWait(ago(4), now);
    expect(n.slow).toBe(false);
    expect(n.detail).toContain("Submitted 4 minutes ago");
    expect(n.detail).toContain("within a few minutes");
    expect(n.detail).toContain("email you");
  });
  it("says just now, and singular units", () => {
    expect(describePaymentWait(ago(0), now).detail).toContain("Submitted just now");
    expect(describePaymentWait(ago(1), now).detail).toContain("1 minute ago");
  });
  it("owns up to a slow one, says a person is on it and not to pay again", () => {
    const n = describePaymentWait(ago(SLOW_PAYMENT_MINUTES), now);
    expect(n.slow).toBe(true);
    expect(n.headline).toContain("longer than usual");
    expect(n.detail).toContain("do not need to pay again");
    expect(describePaymentWait(ago(180), now).detail).toContain("3 hours ago");
    expect(describePaymentWait(ago(60 * 24 * 3), now).detail).toContain("3 days ago");
  });
  it("copes with an unknown submit time", () => {
    expect(describePaymentWait(null, now).detail).not.toContain("Submitted");
  });
});

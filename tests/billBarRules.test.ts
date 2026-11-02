import { describe, expect, it } from "vitest";
import { billBarText } from "@/lib/billBarRules";

const now = new Date(2026, 10, 10, 15, 0);
const at = (days: number) => new Date(2026, 10, 10 + days, 9, 0).toISOString();
const bill = (days: number) => ({ amountCents: 12999, dueDate: at(days), lapseAfterDays: 7 });

describe("the bill bar", () => {
  it("is a friendly reminder until the due day ends", () => {
    expect(billBarText(bill(3), now)).toMatchObject({ stage: "reminder", body: expect.stringContaining("$129.99 is due on Friday, Nov 13") });
    expect(billBarText(bill(1), now).body).toContain("due tomorrow");
    expect(billBarText(bill(0), now)).toMatchObject({ stage: "reminder", body: expect.stringContaining("due today") });
  });

  it("says the payment is missing on the first two late days", () => {
    expect(billBarText(bill(-1), now)).toMatchObject({ stage: "late", title: "We still haven't received your payment" });
    expect(billBarText(bill(-2), now).stage).toBe("late");
  });

  it("then counts down to the lock", () => {
    expect(billBarText(bill(-3), now)).toMatchObject({ stage: "countdown", title: "You will lose access in 4 days", body: expect.stringContaining("$129.99") });
    expect(billBarText(bill(-6), now).title).toBe("You will lose access in 1 day");
    expect(billBarText(bill(-7), now).title).toBe("You will lose access today");
    expect(billBarText(bill(-9), now).title).toBe("You will lose access today");
  });
});

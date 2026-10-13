import { describe, expect, it } from "vitest";
import { parseReversal } from "@/lib/paymentReversal";

describe("parseReversal", () => {
  it("reads a Venmo email saying a payment was reversed", () => {
    expect(parseReversal("Venmo <venmo@venmo.com>", "Your $199.99 payment from Jordan Alemu was reversed", "")?.amountCents).toBe(19999);
    expect(parseReversal("venmo@venmo.com", "Jordan Alemu cancelled a payment", "Amount $25.00")?.amountCents).toBe(2500);
  });
  it("ignores normal receipts, other senders and emails with no amount", () => {
    expect(parseReversal("venmo@venmo.com", "Jordan Alemu paid you $25.00", "")).toBeNull();
    expect(parseReversal("alerts@bankofamerica.com", "A refund of $25.00", "")).toBeNull();
    expect(parseReversal("venmo@venmo.com", "Your payment was cancelled", "No amount here")).toBeNull();
  });
});

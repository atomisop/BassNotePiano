import { describe, expect, it } from "vitest";
import { judgeReceiptReading, parseReceiptReading } from "@/lib/receiptScreenshot";
import { paymentReferenceCode } from "@/lib/paymentReference";

const payment = { id: "cmabc00000EJPIB", amountCents: 32998 };
const now = new Date("2026-10-26T20:00:00Z");
const reading = (extra: Record<string, unknown> = {}) => ({ looksLikeTransferConfirmation: true, amount: 329.98, date: "2026-10-26", message: paymentReferenceCode(payment.id), ...extra });

describe("reading the model's reply", () => {
  it("parses clean JSON, a fenced block, and turns garbage into nothing read", () => {
    expect(parseReceiptReading(JSON.stringify(reading()))).toMatchObject({ amount: 329.98, date: "2026-10-26" });
    expect(parseReceiptReading("```json\n" + JSON.stringify(reading()) + "\n```").amount).toBe(329.98);
    expect(parseReceiptReading("not json")).toEqual({ looksLikeTransferConfirmation: false, amount: null, date: null, message: null });
    expect(parseReceiptReading(JSON.stringify({ looksLikeTransferConfirmation: true, amount: -5, date: "yesterday" }))).toMatchObject({ amount: null, date: null });
  });
});

describe("judging a screenshot against the payment", () => {
  it("agrees when amount, code and a recent date all match", () => {
    const v = judgeReceiptReading(reading(), payment, now);
    expect(v.matches).toBe(true);
    expect(v.summary).toMatch(/all agree/);
  });
  it("says what is wrong: amount, a missing or other code, an old date, not a confirmation", () => {
    expect(judgeReceiptReading(reading({ amount: 164.99 }), payment, now)).toMatchObject({ matches: false });
    expect(judgeReceiptReading(reading({ amount: 164.99 }), payment, now).summary).toMatch(/\$329\.98 is due/);
    expect(judgeReceiptReading(reading({ message: null }), payment, now).summary).toMatch(/no payment code/);
    expect(judgeReceiptReading(reading({ message: "BNP-ZZZZZ" }), payment, now).summary).toMatch(/different payment's code/);
    expect(judgeReceiptReading(reading({ date: "2026-09-01" }), payment, now).summary).toMatch(/not recent/);
    expect(judgeReceiptReading(reading({ looksLikeTransferConfirmation: false }), payment, now).matches).toBe(false);
  });
});

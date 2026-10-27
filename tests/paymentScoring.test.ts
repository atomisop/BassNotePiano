import { describe, expect, it } from "vitest";
import { rankPayments, scorePayment, type ScorablePayment } from "@/lib/paymentScoring";
import { paymentReferenceCode } from "@/lib/paymentReference";

const now = new Date("2026-10-26T12:00:00Z");
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000);
const pay = (id: string, extra: Partial<ScorablePayment> = {}): ScorablePayment => ({ id, status: "AWAITING_TRANSFER", createdAt: hoursAgo(5), payerNames: ["Kiki Kid"], ...extra });
const receipt = (extra: Record<string, unknown> = {}) => ({ senderName: "Pat Parent", memo: null as string | null, receivedAt: now, ...extra });

describe("scoring the open payments an email could belong to", () => {
  it("a note with the payment's own code wins even when the name is a different person's (a parent paying)", () => {
    const mine = pay("cmabc00000EJPIB");
    const other = pay("cmabc00000XXXXX", { payerNames: ["Pat Parent"] });
    const { ranked, confidence } = rankPayments([other, mine], receipt({ memo: paymentReferenceCode(mine.id) }));
    expect(ranked[0].id).toBe(mine.id);
    expect(ranked[0].reasons.join(" ")).toMatch(/code/);
    expect(ranked[1].score).toBeLessThan(ranked[0].score);
    expect(confidence).toBe("strong");
  });

  it("a name match alone is only a likely pick, never strong", () => {
    const { confidence, ranked } = rankPayments([pay("cmabc00000AAAAA", { payerNames: ["Pat Parent"] })], receipt());
    expect(ranked[0].reasons.join(" ")).toMatch(/name matches/);
    expect(confidence).toBe("likely");
  });

  it("a note naming ANOTHER payment's code pushes this one down", () => {
    const mine = pay("cmabc00000AAAAA", { payerNames: ["Pat Parent"] });
    expect(scorePayment(mine, receipt({ memo: "BNP-ZZZZZ" })).score).toBeLessThan(scorePayment(mine, receipt()).score);
  });

  it("a code with one typo still ranks high, below an exact code", () => {
    const p = pay("cmabc00000EJPIB");
    const exact = scorePayment(p, receipt({ memo: "BNP-EJPIB" })).score;
    const typo = scorePayment(p, receipt({ memo: "BNP-EJPIC" })).score;
    expect(typo).toBeGreaterThan(30);
    expect(typo).toBeLessThan(exact);
  });

  it("money that arrives soon after, or after they said they sent it, scores higher than money long after", () => {
    const soon = scorePayment(pay("a", { createdAt: hoursAgo(2) }), receipt()).score;
    const late = scorePayment(pay("a", { createdAt: hoursAgo(24 * 20) }), receipt()).score;
    expect(soon).toBeGreaterThan(late);
    const sent = scorePayment(pay("a", { status: "PENDING_REVIEW", submittedAt: hoursAgo(1) }), receipt());
    expect(sent.reasons.join(" ")).toMatch(/said they sent/);
  });

  it("no signal at all is weak, and two equally good candidates are not strong", () => {
    expect(rankPayments([pay("cmabc00000AAAAA", { createdAt: hoursAgo(24 * 30) })], receipt()).confidence).toBe("weak");
    const a = pay("cmabc00000AAAAA", { payerNames: ["Pat Parent"] });
    const b = pay("cmabc00000BBBBB", { payerNames: ["Pat Parent"] });
    expect(rankPayments([a, b], receipt({ memo: "thanks" })).confidence).not.toBe("strong");
  });
});

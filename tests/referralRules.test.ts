import { describe, expect, it } from "vitest";
import { isQualifyingReferralTerm, makeReferralCode, normalizeReferralCode, rewardWouldHelp } from "@/lib/referralRules";

describe("referral rules", () => {
  it("only 3 and 6 month plans qualify", () => {
    expect(isQualifyingReferralTerm("TERM_3")).toBe(true);
    expect(isQualifyingReferralTerm("TERM_6")).toBe(true);
    for (const t of ["MONTHLY", "TERM_12", ""]) expect(isQualifyingReferralTerm(t)).toBe(false);
  });
  it("makes 8 character codes without look-alike characters", () => {
    for (let i = 0; i < 200; i++) expect(makeReferralCode()).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/);
  });
  it("normalizes input and rejects junk", () => {
    expect(normalizeReferralCode(" abcd2345 ")).toBe("ABCD2345");
    for (const bad of ["short", "toolong123", "abc d234", "ab-d2345", null, 5]) expect(normalizeReferralCode(bad)).toBeNull();
  });
  it("never lowers an existing discount", () => {
    const later = new Date("2027-03-01");
    expect(rewardWouldHelp(null, later)).toBe(true);
    expect(rewardWouldHelp({ percent: 5, expiresAt: null }, later)).toBe(true);
    expect(rewardWouldHelp({ percent: 20, expiresAt: null }, later)).toBe(false);
    expect(rewardWouldHelp({ percent: 10, expiresAt: null }, later)).toBe(false);
    expect(rewardWouldHelp({ percent: 10, expiresAt: new Date("2027-02-01") }, later)).toBe(true);
    expect(rewardWouldHelp({ percent: 10, expiresAt: new Date("2027-04-01") }, later)).toBe(false);
  });
});

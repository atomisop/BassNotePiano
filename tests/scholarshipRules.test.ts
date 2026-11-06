import { describe, expect, it } from "vitest";
import { formatScholarshipCode, makeScholarshipCode, normalizeScholarshipCode, scholarshipStatus } from "@/lib/scholarshipRules";

describe("scholarship rules", () => {
  it("makes 16 digit codes", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const c = makeScholarshipCode();
      expect(c).toMatch(/^\d{16}$/);
      seen.add(c);
    }
    expect(seen.size).toBe(200);
  });
  it("reads pasted codes with spaces or dashes, rejects anything else", () => {
    expect(normalizeScholarshipCode("1234 5678-9012 3456")).toBe("1234567890123456");
    for (const bad of ["123", "12345678901234567", "abcd567890123456", null, 5]) expect(normalizeScholarshipCode(bad)).toBeNull();
  });
  it("formats in groups of four", () => expect(formatScholarshipCode("1234567890123456")).toBe("1234 5678 9012 3456"));
  it("reports status", () => {
    const now = new Date("2026-11-06T12:00:00Z");
    const base = { claimedAt: null, revokedAt: null, expiresAt: null };
    expect(scholarshipStatus(base, now)).toBe("available");
    expect(scholarshipStatus({ ...base, expiresAt: new Date("2026-11-05T00:00:00Z") }, now)).toBe("expired");
    expect(scholarshipStatus({ ...base, revokedAt: now }, now)).toBe("revoked");
    expect(scholarshipStatus({ ...base, claimedAt: now, revokedAt: now }, now)).toBe("claimed");
  });
});

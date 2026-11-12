import { describe, expect, it } from "vitest";
import { parseSignupClaim, parseSignupDraft } from "@/lib/signupDraft";

describe("the sign-up draft kept for the length of a tab", () => {
  it("puts back a name and an email", () => {
    expect(parseSignupDraft(JSON.stringify({ name: "Sam Jones", email: "sam@example.com" }))).toEqual({ name: "Sam Jones", email: "sam@example.com" });
  });
  it("puts back whichever of the two there is", () => {
    expect(parseSignupDraft(JSON.stringify({ email: "sam@example.com" }))).toEqual({ name: "", email: "sam@example.com" });
  });
  it("never carries anything else, a password included", () => {
    const draft = parseSignupDraft(JSON.stringify({ name: "Sam", email: "s@e.co", password: "Secret!1" }));
    expect(draft).toEqual({ name: "Sam", email: "s@e.co" });
    expect(Object.keys(draft ?? {})).not.toContain("password");
  });
  it("ignores missing, empty, wrong-typed and broken values", () => {
    for (const raw of [null, undefined, "", "not json", "null", "[]", JSON.stringify({ name: 5, email: {} }), JSON.stringify({ name: "", email: "" })]) {
      expect(parseSignupDraft(raw as string | null | undefined)).toBeNull();
    }
  });
  it("cuts absurdly long values", () => {
    const draft = parseSignupDraft(JSON.stringify({ name: "x".repeat(500), email: "y".repeat(500) }));
    expect(draft?.name.length).toBe(120);
    expect(draft?.email.length).toBe(254);
  });
});

describe("the claim kept by the browser that set a password", () => {
  const now = 1_800_000_000_000;
  const stored = (over: Record<string, unknown> = {}) => JSON.stringify({ claim: "abc123", email: "sam@example.com", at: now - 1000, ...over });

  it("is returned for the address it was made for, whatever the case", () => {
    expect(parseSignupClaim(stored(), "sam@example.com", now)).toBe("abc123");
    expect(parseSignupClaim(stored(), "  SAM@Example.com ", now)).toBe("abc123");
  });
  it("is never offered for another address", () => {
    expect(parseSignupClaim(stored(), "someone-else@example.com", now)).toBeUndefined();
  });
  it("expires after a day, and a time in the future is not trusted", () => {
    expect(parseSignupClaim(stored({ at: now - 24 * 3600 * 1000 - 1 }), "sam@example.com", now)).toBeUndefined();
    expect(parseSignupClaim(stored({ at: now - 23 * 3600 * 1000 }), "sam@example.com", now)).toBe("abc123");
    expect(parseSignupClaim(stored({ at: now + 3_600_000 }), "sam@example.com", now)).toBeUndefined();
  });
  it("ignores anything missing, malformed or of the wrong type", () => {
    for (const raw of [null, undefined, "", "nope", "null", "[]", stored({ claim: "" }), stored({ claim: 5 }), stored({ email: 5 }), stored({ at: "now" })]) {
      expect(parseSignupClaim(raw as string | null | undefined, "sam@example.com", now)).toBeUndefined();
    }
  });
});

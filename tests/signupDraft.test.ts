import { describe, expect, it } from "vitest";
import { parseSignupDraft } from "@/lib/signupDraft";

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

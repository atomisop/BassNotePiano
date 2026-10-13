import { describe, expect, it } from "vitest";
import { MIN_PASSWORD_LENGTH, PASSWORD_RULES, isGuessablePassword, passwordRequirementError, passwordScore } from "@/lib/passwordRules";

describe("what a new password must contain", () => {
  it("needs the minimum length and a special character", () => {
    expect(MIN_PASSWORD_LENGTH).toBe(8);
    expect(passwordRequirementError("abcdefgh1")).toMatch(/special character/);
    expect(passwordRequirementError("a!b2")).toMatch(/at least 8 characters/);
    expect(passwordRequirementError("short")).toMatch(/at least 8 characters and a special character/);
    expect(passwordRequirementError("longenough!")).toBeNull();
    expect(passwordRequirementError("Tr0ub4dor&3")).toBeNull();
  });
  it("accepts every kind of special character and spaces are not one", () => {
    for (const c of "!@#$%^&*()-_=+[]{};:'\",.<>/?\\|`~") expect(passwordRequirementError(`abcdefg${c}`)).toBeNull();
    expect(passwordRequirementError("abcdefg h")).toMatch(/special character/);
  });
  it("only the length and the special character are required", () => {
    expect(PASSWORD_RULES.filter((r) => r.required).map((r) => r.id)).toEqual(["length", "symbol"]);
  });
});

describe("the strength bar", () => {
  it("is empty, then weak, fair, good and strong as more rules are met", () => {
    expect(passwordScore("")).toBe(0);
    expect(passwordScore("zzzzzzzzzzzzzz")).toBe(1); // a long run of one letter is guessable
    expect(passwordScore("kjhgfdsa")).toBe(1); // meets only the length
    expect(passwordScore("kjhgfdsa!")).toBe(2);
    expect(passwordScore("Kjhgfdsa!")).toBe(3);
    expect(passwordScore("Kjhgf7dsa!")).toBe(4);
  });
  it("marks everyday passwords as guessable and caps them at the lowest bar", () => {
    for (const bad of ["password1!", "Qwerty123!", "abc12345!", "aaaa1111!!"]) {
      expect(isGuessablePassword(bad)).toBe(true);
      expect(passwordScore(bad)).toBe(1);
    }
    expect(isGuessablePassword("Tr0ub4dor&3")).toBe(false);
  });
});

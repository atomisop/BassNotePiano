import { describe, expect, it } from "vitest";
import { isReservedUsername, numberedVariants, usernameCandidates, usernameProblem, USERNAME_FORMAT_MESSAGE, USERNAME_UNAVAILABLE_MESSAGE } from "@/lib/usernameRules";

describe("usernameProblem", () => {
  it("accepts an ordinary name", () => {
    expect(usernameProblem("jordan_plays")).toBeNull();
  });
  it("explains a bad shape", () => {
    expect(usernameProblem("ab")).toBe(USERNAME_FORMAT_MESSAGE);
    expect(usernameProblem("Has Space")).toBe(USERNAME_FORMAT_MESSAGE);
    expect(usernameProblem("a".repeat(21))).toBe(USERNAME_FORMAT_MESSAGE);
  });
  it("refuses a reserved name the same way the saving step does, so the first step cannot pass what the last one refuses", () => {
    // These two are the ones that used to pass step 1 and then fail on Finish: reserved words inside an ordinary name.
    for (const name of ["badminton", "systematic", "atomic_fan", "support_team"]) {
      expect(isReservedUsername(name)).toBe(true);
      expect(usernameProblem(name)).toBe(USERNAME_UNAVAILABLE_MESSAGE);
    }
  });
});

describe("usernameCandidates", () => {
  const fixed = () => 0.5;

  it("builds the obvious names first from a first and last name", () => {
    const list = usernameCandidates("Sam Jones", "sam@example.com", fixed);
    expect(list.slice(0, 3)).toEqual(["samjones", "sam_jones", "samj"]);
  });
  it("only ever offers names that are valid and not reserved", () => {
    for (const name of ["Sam Jones", "Atom Root", "Zoë Müller-Ng", "Admin Teacher", "X Y"]) {
      for (const candidate of usernameCandidates(name, "someone@example.com", fixed)) expect(usernameProblem(candidate)).toBeNull();
    }
  });
  it("folds accents instead of dropping the letter", () => {
    expect(usernameCandidates("José García", null, fixed)[0]).toBe("josegarcia");
  });
  it("falls back to the email when the name has no Latin letters", () => {
    expect(usernameCandidates("አበበ በቀለ", "abebe.bekele@example.com", fixed)).toContain("abebe");
  });
  it("offers nothing when there is nothing to build from", () => {
    expect(usernameCandidates("", null, fixed)).toEqual([]);
    expect(usernameCandidates("!!!", "@example.com", fixed)).toEqual([]);
  });
  it("keeps long names inside 20 characters and never ends on an underscore", () => {
    for (const candidate of usernameCandidates("Bartholomew Featherstonehaugh", null, fixed)) {
      expect(candidate.length).toBeLessThanOrEqual(20);
      expect(candidate.endsWith("_")).toBe(false);
    }
  });
  it("ends with numbered versions, which is the way out when the plain names are taken", () => {
    const list = usernameCandidates("Sam Jones", null, fixed);
    expect(list.some((c) => /\d{2}$/.test(c))).toBe(true);
  });
  it("has no repeats", () => {
    const list = usernameCandidates("Sam Sam", null, fixed);
    expect(new Set(list).size).toBe(list.length);
  });
});

describe("numberedVariants", () => {
  it("adds two digits to a stem", () => {
    expect(numberedVariants("sam", () => 0.5, 1)).toEqual(["sam55"]);
  });
  it("drops variants a reserved word would make", () => {
    expect(numberedVariants("admin", () => 0.5)).toEqual([]);
  });
});

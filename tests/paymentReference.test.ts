import { describe, expect, it } from "vitest";
import { memoHasOtherReference, memoHasReferenceFor, paymentReferenceCode, referenceInMemo } from "@/lib/paymentReference";
import { FULL_NAME_MESSAGE, hasFirstAndLastName } from "@/lib/studentName";

const ID = "cm9x2abcd0001k7q2z4k7q2";

describe("paymentReferenceCode", () => {
  it("is BNP- plus the last five characters of the id, upper case", () => {
    expect(paymentReferenceCode(ID)).toBe("BNP-4K7Q2");
  });
  it("is the same every time for the same payment", () => {
    expect(paymentReferenceCode(ID)).toBe(paymentReferenceCode(ID));
  });
});

describe("finding the code in a note", () => {
  const code = paymentReferenceCode(ID);
  it("matches the code however it is typed", () => {
    for (const memo of [code, code.toLowerCase(), "bnp 4k7q2", "BNP4K7Q2", `piano lessons ${code} thanks`, `(Bass Note Piano) ${code}`]) {
      expect(memoHasReferenceFor(memo, ID), memo).toBe(true);
    }
  });
  it("treats letters people mix up (O and 0, I and L and 1) as the same", () => {
    const id = "xxxxxxxxxxxxxxxxxA0B1C";
    expect(memoHasReferenceFor("BNP-AOBIC", id)).toBe(true);
    expect(memoHasReferenceFor("BNP-AOBLC", id)).toBe(true);
  });
  it("does not match a note with no code, or another payment's code", () => {
    expect(memoHasReferenceFor(null, ID)).toBe(false);
    expect(memoHasReferenceFor("for my lesson", ID)).toBe(false);
    expect(memoHasReferenceFor("BNP-ZZZZZ", ID)).toBe(false);
  });
  it("tells a note that names a different payment from one that names none", () => {
    expect(memoHasOtherReference("BNP-ZZZZZ", ID)).toBe(true);
    expect(memoHasOtherReference(code, ID)).toBe(false);
    expect(memoHasOtherReference("for my lesson", ID)).toBe(false);
    expect(memoHasOtherReference(null, ID)).toBe(false);
  });
  it("reads no code out of ordinary words", () => {
    expect(referenceInMemo("Bass Note Piano lesson")).toBeNull();
  });
});

describe("hasFirstAndLastName", () => {
  it("needs two words", () => {
    expect(hasFirstAndLastName("Jordan Alemu")).toBe(true);
    expect(hasFirstAndLastName("  Jordan   T  Alemu ")).toBe(true);
    expect(hasFirstAndLastName("Bob")).toBe(false);
    expect(hasFirstAndLastName("")).toBe(false);
    expect(hasFirstAndLastName(null)).toBe(false);
  });
  it("does not count digits or punctuation as a name", () => {
    expect(hasFirstAndLastName("Bob 123")).toBe(false);
    expect(hasFirstAndLastName("Bob -")).toBe(false);
  });
  it("accepts names in other alphabets", () => {
    expect(hasFirstAndLastName("ሰላም አበበ")).toBe(true);
    expect(hasFirstAndLastName("José Núñez")).toBe(true);
  });
  it("has a plain message", () => {
    expect(FULL_NAME_MESSAGE).toContain("first and last name");
  });
});

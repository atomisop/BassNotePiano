import { describe, expect, it } from "vitest";
import { formatPhone, maskPhone, normalizePhone } from "@/lib/phone";

describe("normalizePhone", () => {
  it("reads US numbers however they are typed", () => {
    expect(normalizePhone("(555) 234-5678")).toBe("+15552345678");
    expect(normalizePhone("555.234.5678")).toBe("+15552345678");
    expect(normalizePhone("1 555 234 5678")).toBe("+15552345678");
    expect(normalizePhone("+1 555-234-5678")).toBe("+15552345678");
  });
  it("accepts international numbers that start with +", () => {
    expect(normalizePhone("+251 91 123 4567")).toBe("+251911234567");
    expect(normalizePhone("+44 7911 123456")).toBe("+447911123456");
  });
  it("refuses numbers that cannot be real", () => {
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone("12345")).toBeNull();
    expect(normalizePhone("055 234 5678")).toBeNull(); // area code cannot start with 0
    expect(normalizePhone("555 034 5678")).toBeNull(); // exchange cannot start with 0
    expect(normalizePhone("call me")).toBeNull();
    expect(normalizePhone("+0123456789")).toBeNull();
    expect(normalizePhone("+1 155 234 5678")).toBeNull();
    expect(normalizePhone("+1234567890123456")).toBeNull();
  });
});

describe("display helpers", () => {
  it("formats US numbers and masks all but the last four digits", () => {
    expect(formatPhone("+15552345678")).toBe("(555) 234-5678");
    expect(formatPhone("+251911234567")).toBe("+251911234567");
    expect(maskPhone("+15552345678")).toBe("•••• 5678");
  });
});

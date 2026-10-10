import { describe, expect, it } from "vitest";
import { addIgnoredName, isIgnoredSender, normalizeFullName, parseIgnoredNames } from "@/lib/ignoredSenders";

describe("names to ignore in bank emails", () => {
  it("compares full names ignoring case, extra spaces, dots and accents", () => {
    expect(normalizeFullName("  YÍSEHAK   Berhanu. ")).toBe("yisehak berhanu");
  });
  it("reads a comma or line separated list and drops single words", () => {
    expect(parseIgnoredNames("Pat Example, Sam  Sample\nCher; Alex Q Public")).toEqual(["pat example", "sam sample", "alex q public"]);
  });
  it("skips only the exact full name, never someone who shares a first name", () => {
    const list = "Pat Example";
    expect(isIgnoredSender("PAT EXAMPLE", list)).toBe(true);
    expect(isIgnoredSender("Pat Example Jr", list)).toBe(false);
    expect(isIgnoredSender("Pat Johnson", list)).toBe(false);
    expect(isIgnoredSender("Pat", list)).toBe(false);
    expect(isIgnoredSender("", list)).toBe(false);
    expect(isIgnoredSender("Pat Example", "")).toBe(false);
  });
  it("adds a name once, keeps the list tidy, and refuses a single word or an overflow", () => {
    expect(addIgnoredName("", "SAM SAMPLE", 100)).toBe("SAM SAMPLE");
    expect(addIgnoredName("Pat Example", "Sam Sample", 100)).toBe("Pat Example, Sam Sample");
    expect(addIgnoredName("Pat Example,", "Sam Sample", 100)).toBe("Pat Example, Sam Sample");
    expect(addIgnoredName("Pat Example", "pat   example", 100)).toBe("Pat Example");
    expect(addIgnoredName("Pat Example", "Cher", 100)).toBe("Pat Example");
    expect(addIgnoredName("Pat Example", "Sam Sample", 15)).toBe("Pat Example");
  });
});

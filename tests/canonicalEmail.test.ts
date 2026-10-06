import { describe, expect, it } from "vitest";
import { canonicalEmail } from "@/lib/canonicalEmail";

describe("canonicalEmail", () => {
  it("treats Gmail dots, plus tags and case as one inbox", () => {
    expect(canonicalEmail("A.b+promo@Gmail.com")).toBe("ab@gmail.com");
    expect(canonicalEmail("ab@googlemail.com")).toBe("ab@gmail.com");
  });
  it("leaves other domains alone, since a dot there can be another person", () => {
    expect(canonicalEmail("j.doe@work.com")).toBe("j.doe@work.com");
    expect(canonicalEmail("J.Doe+x@Work.com")).toBe("j.doe+x@work.com");
  });
});

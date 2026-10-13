import { describe, expect, it } from "vitest";
import { canonicalEmail } from "@/lib/canonicalEmail";

describe("canonicalEmail", () => {
  it("treats Gmail dots, plus tags and case as one inbox", () => {
    expect(canonicalEmail("A.b+promo@Gmail.com")).toBe("ab@gmail.com");
    expect(canonicalEmail("ab@googlemail.com")).toBe("ab@gmail.com");
  });
  it("keeps dots at other domains (a dot there can be another person) but drops a plus tag everywhere", () => {
    expect(canonicalEmail("j.doe@work.com")).toBe("j.doe@work.com");
    expect(canonicalEmail("J.Doe+x@Work.com")).toBe("j.doe@work.com");
    expect(canonicalEmail("sam+trial2@outlook.com")).toBe("sam@outlook.com");
    expect(canonicalEmail("sam+a+b@icloud.com")).toBe("sam@icloud.com");
  });
});

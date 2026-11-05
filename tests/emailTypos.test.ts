import { describe, expect, it } from "vitest";
import { suggestEmailFix } from "@/lib/emailTypos";

describe("suggestEmailFix", () => {
  it("corrects the slips seen in the wild", () => {
    expect(suggestEmailFix("sam@gnail.com")).toBe("sam@gmail.com");
    expect(suggestEmailFix("sam@gmial.com")).toBe("sam@gmail.com");
    expect(suggestEmailFix("sam@gmail.con")).toBe("sam@gmail.com");
    expect(suggestEmailFix("sam@hotmal.com")).toBe("sam@hotmail.com");
    expect(suggestEmailFix("Sam.Lee@Yaho.com")).toBe("Sam.Lee@yahoo.com");
  });

  it("corrects one-letter slips next to a known provider", () => {
    expect(suggestEmailFix("sam@gmali.com")).toBe("sam@gmail.com");
    expect(suggestEmailFix("sam@outlook.cm")).toBe("sam@outlook.com");
  });

  it("leaves correct and unknown addresses alone", () => {
    expect(suggestEmailFix("sam@gmail.com")).toBeNull();
    expect(suggestEmailFix("sam@googlemail.com")).toBeNull();
    expect(suggestEmailFix("sam@bassnotepiano.com")).toBeNull();
    expect(suggestEmailFix("sam@mail.com")).toBeNull();
    expect(suggestEmailFix("sam@gmail.co.uk")).toBeNull();
    expect(suggestEmailFix("not an email")).toBeNull();
    expect(suggestEmailFix("sam@")).toBeNull();
    expect(suggestEmailFix("")).toBeNull();
  });
});

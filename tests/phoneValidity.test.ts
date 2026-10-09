import { describe, expect, it } from "vitest";
import { assessPhone } from "@/lib/phoneValidity";

describe("assessPhone", () => {
  it("accepts real-looking numbers however they are typed", () => {
    expect(assessPhone("(212) 456-7890")).toEqual({ ok: true, phone: "+12124567890" });
    expect(assessPhone("+1 415 234 5678")).toEqual({ ok: true, phone: "+14152345678" });
    expect(assessPhone("+251 91 123 4567")).toEqual({ ok: true, phone: "+251911234567" });
    expect(assessPhone("+44 7911 123456")).toEqual({ ok: true, phone: "+447911123456" });
  });

  it("refuses numbers that fit the shape but cannot exist", () => {
    expect(assessPhone("(555) 234-5678").ok).toBe(false); // 555 is not an area code
    expect(assessPhone("(999) 234-5678").ok).toBe(false);
    expect(assessPhone("+251 11 23").ok).toBe(false);
  });

  it("refuses obvious filler and fiction numbers", () => {
    expect(assessPhone("+44 7777 777777").ok).toBe(false);
    expect(assessPhone("212-555-0123").ok).toBe(false);
    expect(assessPhone("123-456-7890").ok).toBe(false);
    expect(assessPhone("not a number").ok).toBe(false);
    expect(assessPhone("").ok).toBe(false);
  });

  it("gives a plain reason", () => {
    const r = assessPhone("(555) 234-5678");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/real phone number/);
  });
});

import { afterEach, describe, expect, it } from "vitest";
import { isEmailBlocked } from "@/lib/emailBlock";

describe("isEmailBlocked", () => {
  const saved = { o: process.env.OWNER_EMAIL, e: process.env.EMAIL_BLOCKED_RECIPIENTS };
  afterEach(() => {
    if (saved.o === undefined) delete process.env.OWNER_EMAIL; else process.env.OWNER_EMAIL = saved.o;
    if (saved.e === undefined) delete process.env.EMAIL_BLOCKED_RECIPIENTS; else process.env.EMAIL_BLOCKED_RECIPIENTS = saved.e;
  });

  it("blocks the owner address, including Gmail dot and plus variants", () => {
    process.env.OWNER_EMAIL = "owner.name@gmail.com";
    expect(isEmailBlocked("Owner.Name@gmail.com")).toBe(true);
    expect(isEmailBlocked("ownername+x@gmail.com")).toBe(true);
    expect(isEmailBlocked("student@gmail.com")).toBe(false);
  });
  it("blocks extra addresses from EMAIL_BLOCKED_RECIPIENTS", () => {
    process.env.OWNER_EMAIL = "owner@example.com";
    process.env.EMAIL_BLOCKED_RECIPIENTS = "a@x.com, b@y.com";
    expect(isEmailBlocked("b@y.com")).toBe(true);
    expect(isEmailBlocked("c@y.com")).toBe(false);
  });
});

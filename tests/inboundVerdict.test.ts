import { describe, expect, it } from "vitest";
import { isSenderAuthenticated, parseMessageHeaders } from "@/lib/inboundEmail";

const headers = (pairs: [string, string][]) => parseMessageHeaders(JSON.stringify(pairs));

describe("sender verdict headers", () => {
  it("passes when Mailgun's verdict is pass", () => {
    expect(isSenderAuthenticated(headers([["X-Mailgun-Dkim-Check-Result", "Pass"]]))).toBe(true);
  });

  it("a forged pass written by the sender cannot hide Mailgun's real fail, in either order", () => {
    expect(isSenderAuthenticated(headers([["X-Mailgun-Dkim-Check-Result", "Pass"], ["X-Mailgun-Dkim-Check-Result", "Fail"]]))).toBe(false);
    expect(isSenderAuthenticated(headers([["X-Mailgun-Dkim-Check-Result", "Fail"], ["X-Mailgun-Dkim-Check-Result", "Pass"]]))).toBe(false);
  });

  it("no verdict is not a pass", () => {
    expect(isSenderAuthenticated(headers([]))).toBe(false);
  });
});

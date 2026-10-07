import { createHmac } from "crypto";
import { describe, expect, it } from "vitest";
import {
  isAutomatedMail,
  isSenderAuthenticated,
  isStudioRecipient,
  normalizeSubject,
  parseMessageHeaders,
  parseMessageIds,
  parseSender,
  replySubject,
  verifyMailgunSignature,
} from "@/lib/inboundEmail";

const KEY = "test-signing-key";
const NOW = 1_800_000_000_000;

function sign(timestamp: string, token: string, key = KEY) {
  return createHmac("sha256", key).update(timestamp + token).digest("hex");
}

describe("verifyMailgunSignature", () => {
  const timestamp = String(NOW / 1000);
  it("accepts a correct, fresh signature", () => {
    expect(verifyMailgunSignature({ signingKey: KEY, timestamp, token: "abc", signature: sign(timestamp, "abc"), nowMs: NOW })).toBe(true);
  });
  it("rejects a wrong key, a changed token and a missing signature", () => {
    expect(verifyMailgunSignature({ signingKey: KEY, timestamp, token: "abc", signature: sign(timestamp, "abc", "other"), nowMs: NOW })).toBe(false);
    expect(verifyMailgunSignature({ signingKey: KEY, timestamp, token: "abd", signature: sign(timestamp, "abc"), nowMs: NOW })).toBe(false);
    expect(verifyMailgunSignature({ signingKey: KEY, timestamp, token: "abc", signature: "", nowMs: NOW })).toBe(false);
  });
  it("rejects a signature that is too old or from the future", () => {
    const old = String(NOW / 1000 - 6 * 60);
    expect(verifyMailgunSignature({ signingKey: KEY, timestamp: old, token: "abc", signature: sign(old, "abc"), nowMs: NOW })).toBe(false);
    const future = String(NOW / 1000 + 6 * 60);
    expect(verifyMailgunSignature({ signingKey: KEY, timestamp: future, token: "abc", signature: sign(future, "abc"), nowMs: NOW })).toBe(false);
  });
  it("refuses everything when no key is configured", () => {
    expect(verifyMailgunSignature({ signingKey: "", timestamp, token: "abc", signature: sign(timestamp, "abc", ""), nowMs: NOW })).toBe(false);
  });
});

describe("parseSender", () => {
  it("reads a display name and address", () => {
    expect(parseSender('"Jane Doe" <Jane@Example.com>')).toEqual({ email: "jane@example.com", name: "Jane Doe" });
    expect(parseSender("Jane <jane@example.com>")).toEqual({ email: "jane@example.com", name: "Jane" });
  });
  it("accepts a bare address", () => {
    expect(parseSender("jane@example.com")).toEqual({ email: "jane@example.com", name: null });
  });
  it("returns null when there is no usable address", () => {
    expect(parseSender("")).toBeNull();
    expect(parseSender("not an address")).toBeNull();
    expect(parseSender("Jane <nope>")).toBeNull();
  });
});

describe("isAutomatedMail", () => {
  const headers = (pairs: [string, string][]) => parseMessageHeaders(JSON.stringify(pairs));
  it("flags auto-replies and bulk mail", () => {
    expect(isAutomatedMail(headers([["Auto-Submitted", "auto-replied"]]), "a@b.com")).toBe(true);
    expect(isAutomatedMail(headers([["Precedence", "bulk"]]), "a@b.com")).toBe(true);
    expect(isAutomatedMail(headers([["X-Autoreply", "yes"]]), "a@b.com")).toBe(true);
  });
  it("treats Auto-Submitted: no as a real person", () => {
    expect(isAutomatedMail(headers([["Auto-Submitted", "no"]]), "a@b.com")).toBe(false);
  });
  it("flags bounce and no-reply senders and our own studio address", () => {
    expect(isAutomatedMail(new Map(), "mailer-daemon@googlemail.com")).toBe(true);
    expect(isAutomatedMail(new Map(), "noreply@example.com")).toBe(true);
    expect(isAutomatedMail(new Map(), "music@bassnotepiano.com")).toBe(true);
  });
  it("lets an ordinary customer through", () => {
    expect(isAutomatedMail(headers([["Subject", "hello"]]), "parent@gmail.com")).toBe(false);
  });
});

describe("subjects and message ids", () => {
  it("normalizes stacked prefixes and case", () => {
    expect(normalizeSubject("Re: RE: Fwd:  Piano   lessons ")).toBe("piano lessons");
    expect(normalizeSubject("Piano lessons")).toBe("piano lessons");
  });
  it("builds one Re: for a reply", () => {
    expect(replySubject("Piano lessons")).toBe("Re: Piano lessons");
    expect(replySubject("re: Piano lessons")).toBe("re: Piano lessons");
    expect(replySubject(null)).toBe("Re: Your message to Bass Note Piano");
  });
  it("collects message ids once, in order", () => {
    expect(parseMessageIds("<a@x>", "<b@x> <a@x> junk <c@x>")).toEqual(["<a@x>", "<b@x>", "<c@x>"]);
    expect(parseMessageIds(null, undefined, "")).toEqual([]);
  });
  it("treats malformed header blobs as empty", () => {
    expect(parseMessageHeaders("not json").size).toBe(0);
    expect(parseMessageHeaders('{"a":1}').size).toBe(0);
    expect(parseMessageHeaders(null).size).toBe(0);
  });
});

describe("isSenderAuthenticated", () => {
  const headers = (pairs: [string, string][]) => parseMessageHeaders(JSON.stringify(pairs));
  it("accepts a DKIM or SPF pass", () => {
    expect(isSenderAuthenticated(headers([["X-Mailgun-Dkim-Check-Result", "Pass"]]))).toBe(true);
    expect(isSenderAuthenticated(headers([["X-Mailgun-Spf", "Pass"]]))).toBe(true);
  });
  it("rejects a fail, a softfail and no result", () => {
    expect(isSenderAuthenticated(headers([["X-Mailgun-Dkim-Check-Result", "Fail"], ["X-Mailgun-Spf", "SoftFail"]]))).toBe(false);
    expect(isSenderAuthenticated(new Map())).toBe(false);
  });
});

describe("isStudioRecipient", () => {
  it("accepts music@ on the domain and on a subdomain", () => {
    expect(isStudioRecipient("music@bassnotepiano.com")).toBe(true);
    expect(isStudioRecipient("Music@Inbox.BassNotePiano.com")).toBe(true);
  });
  it("rejects other addresses and look-alike domains", () => {
    expect(isStudioRecipient("info@bassnotepiano.com")).toBe(false);
    expect(isStudioRecipient("music@evilbassnotepiano.com")).toBe(false);
    expect(isStudioRecipient("music@bassnotepiano.com.evil.com")).toBe(false);
    expect(isStudioRecipient("")).toBe(false);
  });
});

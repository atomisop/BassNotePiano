import { createHmac } from "crypto";
import { describe, expect, it } from "vitest";
import { EMAIL_STATUS_LABEL, nextEmailStatus, statusFromResendEvent, verifyResendSignature } from "@/lib/emailLogRules";

describe("nextEmailStatus", () => {
  it("only moves forward: sent, delayed, delivered, opened, clicked", () => {
    expect(nextEmailStatus("SENT", "DELIVERED")).toBe("DELIVERED");
    expect(nextEmailStatus("DELIVERED", "OPENED")).toBe("OPENED");
    expect(nextEmailStatus("OPENED", "DELIVERED")).toBe("OPENED"); // a late "delivered" never undoes "opened"
    expect(nextEmailStatus("CLICKED", "OPENED")).toBe("CLICKED");
    expect(nextEmailStatus("DELIVERED", "DELAYED")).toBe("DELIVERED");
  });
  it("a bounce or a spam report always wins", () => {
    expect(nextEmailStatus("OPENED", "COMPLAINED")).toBe("COMPLAINED");
    expect(nextEmailStatus("SENT", "BOUNCED")).toBe("BOUNCED");
    expect(nextEmailStatus("BOUNCED", "DELIVERED")).toBe("BOUNCED");
  });
});

describe("statusFromResendEvent", () => {
  it("maps Resend's event names and ignores the rest", () => {
    expect(statusFromResendEvent("email.delivered")).toBe("DELIVERED");
    expect(statusFromResendEvent("email.opened")).toBe("OPENED");
    expect(statusFromResendEvent("email.bounced")).toBe("BOUNCED");
    expect(statusFromResendEvent("email.complained")).toBe("COMPLAINED");
    expect(statusFromResendEvent("email.delivery_delayed")).toBe("DELAYED");
    expect(statusFromResendEvent("contact.created")).toBeNull();
  });
  it("has a plain label for every status", () => {
    expect(EMAIL_STATUS_LABEL.COMPLAINED).toBe("Marked as spam");
  });
});

describe("verifyResendSignature", () => {
  const key = Buffer.from("super-secret-key-bytes");
  const secret = `whsec_${key.toString("base64")}`;
  const body = JSON.stringify({ type: "email.delivered", data: { email_id: "abc" } });
  const sign = (id: string, ts: string, payload: string) => createHmac("sha256", key).update(`${id}.${ts}.${payload}`).digest("base64");
  const now = 1_800_000_000;

  it("accepts a correct signature, also among several", () => {
    const ts = String(now);
    expect(verifyResendSignature(secret, { id: "msg_1", timestamp: ts, signature: `v1,${sign("msg_1", ts, body)}` }, body, now)).toBe(true);
    expect(verifyResendSignature(secret, { id: "msg_1", timestamp: ts, signature: `v1,bogus v1,${sign("msg_1", ts, body)}` }, body, now)).toBe(true);
  });
  it("refuses a changed body, a wrong secret, a stale or missing timestamp", () => {
    const ts = String(now);
    const sig = `v1,${sign("msg_1", ts, body)}`;
    expect(verifyResendSignature(secret, { id: "msg_1", timestamp: ts, signature: sig }, body + " ", now)).toBe(false);
    expect(verifyResendSignature(`whsec_${Buffer.from("other").toString("base64")}`, { id: "msg_1", timestamp: ts, signature: sig }, body, now)).toBe(false);
    expect(verifyResendSignature(secret, { id: "msg_1", timestamp: ts, signature: sig }, body, now + 600)).toBe(false);
    expect(verifyResendSignature(secret, { id: "msg_1", timestamp: null, signature: sig }, body, now)).toBe(false);
    expect(verifyResendSignature("", { id: "msg_1", timestamp: ts, signature: sig }, body, now)).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { categoryIsPushed, isAllowedPushEndpoint, parsePushSubscription } from "@/lib/pushRules";

describe("isAllowedPushEndpoint", () => {
  it("accepts the real push services", () => {
    for (const u of ["https://fcm.googleapis.com/fcm/send/abc", "https://updates.push.services.mozilla.com/wpush/v2/x", "https://web.push.apple.com/QAbc", "https://wns2-par02p.notify.windows.com/w/?token=1"])
      expect(isAllowedPushEndpoint(u)).toBe(true);
  });
  it("rejects anything the server must not call", () => {
    for (const u of ["http://fcm.googleapis.com/x", "https://evil.example.com/x", "https://fcm.googleapis.com.evil.com/x", "https://user:pw@fcm.googleapis.com/x", "https://fcm.googleapis.com:8443/x", "https://169.254.169.254/latest", "https://localhost/x", "not a url", "", 5, null])
      expect(isAllowedPushEndpoint(u as never)).toBe(false);
  });
});

describe("parsePushSubscription", () => {
  const good = { endpoint: "https://fcm.googleapis.com/fcm/send/abc", keys: { p256dh: "BNc-abc_123", auth: "xyz_-1" } };
  it("takes a well formed subscription", () => expect(parsePushSubscription(good)).toEqual({ endpoint: good.endpoint, p256dh: "BNc-abc_123", auth: "xyz_-1" }));
  it("rejects missing, odd or oversized keys and bad endpoints", () => {
    expect(parsePushSubscription(null)).toBeNull();
    expect(parsePushSubscription({ ...good, keys: { p256dh: "a b", auth: "x" } })).toBeNull();
    expect(parsePushSubscription({ ...good, keys: { p256dh: "a".repeat(300), auth: "x" } })).toBeNull();
    expect(parsePushSubscription({ ...good, keys: {} })).toBeNull();
    expect(parsePushSubscription({ ...good, endpoint: "https://evil.example.com/x" })).toBeNull();
  });
});

describe("categoryIsPushed", () => {
  it("is only the reminder and class switches", () => {
    expect(categoryIsPushed("reminders")).toBe(true);
    expect(categoryIsPushed("classes")).toBe(true);
    for (const c of ["payments", "social", "roleUpdates", undefined, null]) expect(categoryIsPushed(c as never)).toBe(false);
  });
});

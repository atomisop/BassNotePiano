import { beforeAll, describe, expect, it } from "vitest";
import {
  changeTimePath,
  connectAndJoinPath,
  discordReturnPath,
  groupBillPath,
  loginHref,
  onboardingRedirect,
  parseSlotKey,
  pauseNeedsPayment,
  payAgainPath,
  receiptPath,
  registerHref,
  scholarshipNextStep,
  startPlanWithTimePath,
  withDiscordFlag,
} from "@/lib/inPlaceLinks";
import { checkState, makeState, readState } from "@/lib/discordLink";
import { pauseBlockedReason } from "@/lib/planPause";

beforeAll(() => {
  process.env.NEXTAUTH_SECRET = "test-secret";
});

describe("weekly times in links", () => {
  it("reads only a plain scheduleId:chunkIndex", () => {
    expect(parseSlotKey("cmabc123:2")).toEqual({ scheduleId: "cmabc123", chunkIndex: 2 });
    expect(parseSlotKey("")).toBeNull();
    expect(parseSlotKey(null)).toBeNull();
    expect(parseSlotKey("abc")).toBeNull();
    expect(parseSlotKey("abc:-1")).toBeNull();
    expect(parseSlotKey("a b:1")).toBeNull();
    expect(parseSlotKey("abc:1:2")).toBeNull();
    expect(parseSlotKey("../x:1")).toBeNull();
  });

  it("opens the picker on Lessons, with the time or with nothing chosen", () => {
    expect(changeTimePath("s1:0")).toBe("/lessons?changeTime=s1%3A0");
    expect(changeTimePath()).toBe("/lessons?changeTime=");
    expect(changeTimePath("javascript:alert(1)")).toBe("/lessons?changeTime=");
  });

  it("starts a plan with a time picked elsewhere, or the bare plan form", () => {
    expect(startPlanWithTimePath("s1:3")).toBe("/billing/plans?slot=s1%3A3");
    expect(startPlanWithTimePath("bad")).toBe("/billing/plans");
    expect(startPlanWithTimePath(undefined)).toBe("/billing/plans");
  });
});

describe("payment notices land on the action", () => {
  it("links a receipt and a resubmit straight to that payment", () => {
    expect(receiptPath("pay_1")).toBe("/billing/receipt/pay_1");
    expect(payAgainPath("pay_1")).toBe("/billing/history?pay=pay_1");
  });

  it("sends a parent's group bill to the Parent page, like the bill bar", () => {
    expect(groupBillPath("PARENT")).toBe("/parent");
    expect(groupBillPath("FAMILY")).toBe("/billing/plans");
    expect(groupBillPath(null)).toBe("/billing/plans");
  });
});

describe("a pricing choice survives sign-up", () => {
  it("keeps where they were going through the welcome wizard", () => {
    expect(onboardingRedirect("/billing/plans", "?term=TERM_6&who=family")).toBe(`/onboarding?next=${encodeURIComponent("/billing/plans?term=TERM_6&who=family")}`);
    expect(onboardingRedirect("/billing/plans", "?term=TERM_3&_rsc=abc")).toBe(`/onboarding?next=${encodeURIComponent("/billing/plans?term=TERM_3")}`);
    expect(onboardingRedirect("/dashboard", "")).toBe("/onboarding");
    expect(onboardingRedirect("/", "")).toBe("/onboarding");
    expect(onboardingRedirect("//evil.example", "")).toBe("/onboarding");
    expect(onboardingRedirect("/\\evil.example", "")).toBe("/onboarding");
  });

  it("carries the destination on Create account and Log in, never somewhere else", () => {
    expect(registerHref("/billing/plans?term=TERM_3")).toBe(`/register?callbackUrl=${encodeURIComponent("/billing/plans?term=TERM_3")}`);
    expect(registerHref("/billing/plans?term=TERM_3", true)).toBe("/register");
    expect(registerHref("/dashboard")).toBe("/register");
    expect(registerHref("https://evil.example")).toBe("/register");
    expect(registerHref("//evil.example")).toBe("/register");
    expect(loginHref("/billing/plans?who=family")).toBe(`/login?callbackUrl=${encodeURIComponent("/billing/plans?who=family")}`);
    expect(loginHref("https://evil.example")).toBe("/login");
  });
});

describe("Discord comes back to where it was connected from", () => {
  const origin = "https://bassnotepiano.com";

  it("uses the asked path, then the page the button was on, then Lessons", () => {
    expect(discordReturnPath("/account", null, origin)).toBe("/account");
    expect(discordReturnPath(null, "https://bassnotepiano.com/dashboard?x=1", origin)).toBe("/dashboard?x=1");
    expect(discordReturnPath(null, "https://evil.example/dashboard", origin)).toBe("/lessons");
    expect(discordReturnPath("//evil.example", null, origin)).toBe("/lessons");
    expect(discordReturnPath("https://evil.example", null, origin)).toBe("/lessons");
    expect(discordReturnPath("/api/discord/connect", null, origin)).toBe("/lessons");
    expect(discordReturnPath(null, null, origin)).toBe("/lessons");
  });

  it("adds the result flag without losing the page's own query", () => {
    expect(withDiscordFlag("/lessons?join=next", "linked")).toBe("/lessons?join=next&discord=linked");
    expect(withDiscordFlag("/account", "error")).toBe("/account?discord=error");
    expect(withDiscordFlag("//evil.example", "linked")).toBe("/lessons?discord=linked");
  });

  it("connect and join comes back to Lessons with the class to open", () => {
    expect(connectAndJoinPath("bk_1")).toBe(`/api/discord/connect?return=${encodeURIComponent("/lessons?join=bk_1")}`);
    expect(connectAndJoinPath(null)).toBe(`/api/discord/connect?return=${encodeURIComponent("/lessons?join=next")}`);
    expect(connectAndJoinPath("x&y=1")).toBe(`/api/discord/connect?return=${encodeURIComponent("/lessons?join=next")}`);
  });

  it("signs the return page into the state, so it cannot be swapped", () => {
    const { nonce, state } = makeState("user-1", "/account");
    expect(readState(state, nonce, "user-1")).toEqual({ ok: true, returnTo: "/account" });
    expect(checkState(state, nonce, "user-1")).toBe(true);
    expect(readState(state, nonce, "user-2").ok).toBe(false);
    const [n, sig] = state.split(".");
    const swapped = `${n}.${sig}.${Buffer.from("/evil", "utf8").toString("base64url")}`;
    expect(readState(swapped, nonce, "user-1").ok).toBe(false);
    expect(readState(`${n}.${sig}`, nonce, "user-1").ok).toBe(false);
    expect(readState(`${state}.extra`, nonce, "user-1").ok).toBe(false);
    // A state made without a return page still works, and asks for none.
    const plain = makeState("user-1");
    expect(readState(plain.state, plain.nonce, "user-1")).toEqual({ ok: true, returnTo: null });
  });
});

describe("plan follow-ups", () => {
  it("offers the right next step after a scholarship is claimed", () => {
    expect(scholarshipNextStep(null)).toBe("start");
    expect(scholarshipNextStep({ term: "MONTHLY", familyGroupId: null })).toBe("switch");
    expect(scholarshipNextStep({ term: "TERM_3", familyGroupId: null })).toBe("switch");
    expect(scholarshipNextStep({ term: "TERM_6", familyGroupId: null })).toBeNull();
    expect(scholarshipNextStep({ term: "MONTHLY", familyGroupId: "g1" })).toBeNull();
  });

  it("gives a Pay button only to the pause refusals that a payment fixes", () => {
    const now = new Date("2026-11-09T12:00:00Z");
    const base = { status: "ACTIVE", familyGroupId: null, installmentsPaid: 2, nextDueDate: new Date("2026-11-20T12:00:00Z"), pausedAt: null, pauseUntil: null };
    expect(pauseNeedsPayment(pauseBlockedReason({ ...base, installmentsPaid: 0 }, 1, now))).toBe(true);
    expect(pauseNeedsPayment(pauseBlockedReason({ ...base, nextDueDate: new Date("2026-11-08T12:00:00Z") }, 1, now))).toBe(true);
    expect(pauseNeedsPayment(pauseBlockedReason({ ...base, pausedAt: new Date("2026-10-01T12:00:00Z") }, 1, now))).toBe(false);
    expect(pauseNeedsPayment(pauseBlockedReason({ ...base, pauseUntil: new Date("2026-12-01T12:00:00Z"), pausedAt: new Date("2026-11-01T12:00:00Z") }, 1, now))).toBe(false);
    expect(pauseNeedsPayment(null)).toBe(false);
  });
});

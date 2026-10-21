import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

let signedIn: { sub: string; email: string; onboarded: boolean; role: string } | null = null;
vi.mock("next-auth/jwt", () => ({ getToken: async () => signedIn }));

import { NextRequest } from "next/server";
import { middleware } from "@/middleware";
import { recipientTag } from "@/lib/recipientTag";

const saved = { url: process.env.NEXTAUTH_URL, secret: process.env.NEXTAUTH_SECRET };
beforeAll(() => {
  process.env.NEXTAUTH_URL = "https://app.example.test";
  process.env.NEXTAUTH_SECRET = "unit-test-secret";
});
afterAll(() => {
  process.env.NEXTAUTH_URL = saved.url;
  process.env.NEXTAUTH_SECRET = saved.secret;
});

const sean = "sean@example.test";
const isaac = "isaac@example.test";
const as = (email: string | null) => (signedIn = email ? { sub: email, email, onboarded: true, role: "STUDENT" } : null);
const go = (path: string) => middleware(new NextRequest(`https://app.example.test${path}`));

describe("an emailed link opened while signed in as someone else", () => {
  it("stops on the sign-in-with-the-right-account screen, for pages that need an account", async () => {
    const tag = await recipientTag(sean);
    as(isaac);
    const res = await go(`/account?tab=notifications&r=${tag}&rm=s***n%40example.test`);
    expect(res.headers.get("location")).toContain("/wrong-account");
  });

  it("also stops on pages that need no sign-in (the unsubscribe page)", async () => {
    const tag = await recipientTag(sean);
    as(isaac);
    const res = await go(`/unsubscribe?u=abc&c=reminders&t=zzz&r=${tag}&rm=s***n%40example.test`);
    expect(res.headers.get("location")).toContain("/wrong-account");
    expect(res.headers.get("location")).toContain(encodeURIComponent("/unsubscribe?"));
  });

  it("lets the right account, and anyone signed out, straight through", async () => {
    const tag = await recipientTag(sean);
    as(sean);
    expect((await go(`/unsubscribe?u=abc&r=${tag}`)).headers.get("location")).toBeNull();
    expect((await go(`/account?tab=notifications&r=${tag}`)).headers.get("location")).toBeNull();
    as(null);
    expect((await go(`/unsubscribe?u=abc&r=${tag}`)).headers.get("location")).toBeNull();
  });

  it("never loops on the screen that explains it, and ignores ordinary links with no tag", async () => {
    const tag = await recipientTag(sean);
    as(isaac);
    expect((await go(`/wrong-account?next=%2Fx&r=${tag}`)).headers.get("location")).toBeNull();
    expect((await go("/pricing")).headers.get("location")).toBeNull();
    expect((await go("/unsubscribe?u=abc")).headers.get("location")).toBeNull();
  });
});

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/auth", () => ({ getServerAuthSession: async () => null, getServerSession: async () => null, authOptions: {} }));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));
const sendCode = vi.fn(async () => {});
vi.mock("@/lib/email", async (orig) => ({ ...(await orig<typeof import("@/lib/email")>()), sendVerificationCodeEmail: (...a: unknown[]) => (sendCode as (...x: unknown[]) => Promise<void>)(...a) }));
const report = vi.fn();
vi.mock("@/lib/reportError", () => ({ reportError: (...a: unknown[]) => report(...a) }));
import { createAndSendCode } from "@/lib/verification";
import { resendVerificationEmailAction } from "@/app/(auth)/verify-email/actions";
import { makeUser, newTag, prisma } from "./helpers";

// Two ways a person never got their sign-up code: the resend button said "sent" while the limit silently blocked it,
// and a first send that failed was ignored by sign-up and never reported.
const tag = newTag("ce");
let user: { id: string; email: string };

beforeAll(async () => {
  user = await makeUser(tag, "Codes", { emailVerified: null });
});
beforeEach(async () => {
  sendCode.mockReset();
  sendCode.mockImplementation(async () => {});
  report.mockReset();
  await prisma.verificationCode.deleteMany({ where: { email: user.email } });
});
afterAll(async () => {
  await prisma.verificationCode.deleteMany({ where: { email: user.email } });
  await prisma.user.deleteMany({ where: { id: user.id } });
});

describe("a code email that cannot be sent", () => {
  it("is returned as a failure and reported to monitoring, not just logged", async () => {
    sendCode.mockRejectedValueOnce(new Error("Resend failed"));
    const result = await createAndSendCode({ email: user.email, userId: user.id, purpose: "EMAIL_VERIFY" });
    expect(result).toEqual({ ok: false });
    expect(report).toHaveBeenCalledTimes(1);
    expect(String(report.mock.calls[0][1])).toContain("EMAIL_VERIFY");
  });

  it("a normal send reports nothing", async () => {
    expect(await createAndSendCode({ email: user.email, userId: user.id, purpose: "EMAIL_VERIFY" })).toEqual({ ok: true });
    expect(report).not.toHaveBeenCalled();
  });
});

describe("resending the sign-up code", () => {
  it("sends one normally", async () => {
    expect(await resendVerificationEmailAction(user.email)).toEqual({ ok: true });
    expect(sendCode).toHaveBeenCalledTimes(1);
  });

  it("tells the person to wait once they have asked too many times, and sends nothing", async () => {
    await prisma.verificationCode.createMany({
      data: Array.from({ length: 5 }, (_, i) => ({ email: user.email, userId: user.id, purpose: "EMAIL_VERIFY" as const, codeHash: `h${i}`, expiresAt: new Date(Date.now() + 600_000) })),
    });
    const result = await resendVerificationEmailAction(user.email);
    expect(result).toMatchObject({ ok: false });
    expect((result as { error: string }).error).toMatch(/paused for about \d+ minutes/);
    expect(sendCode).not.toHaveBeenCalled();
  });

  it("says so plainly when the email service fails", async () => {
    sendCode.mockRejectedValueOnce(new Error("Resend failed"));
    const result = await resendVerificationEmailAction(user.email);
    expect(result).toMatchObject({ ok: false });
    expect((result as { error: string }).error).toMatch(/couldn't send the email/);
  });

  it("an unknown address still answers like a known one (no account lookup leak)", async () => {
    expect(await resendVerificationEmailAction(`${tag}-nobody@example.com`)).toEqual({ ok: true });
    expect(sendCode).not.toHaveBeenCalled();
  });
});

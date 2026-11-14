import { afterAll, describe, expect, it, vi } from "vitest";

// Who keeps the password when an email is confirmed (src/lib/pendingSignup.ts). The rule: a password survives only if the browser
// that set it proves it with its claim; every other confirmation proves the inbox but forgets the password on file. These tests play
// the attacks and the honest flows against real rows.
vi.mock("@/lib/auth", () => ({ getServerAuthSession: async () => null, authOptions: {} }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-nf-client-connection-ip": "203.0.113.60" }) }));
vi.mock("@/lib/rateLimit", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/rateLimit")>()), consumeRateLimit: async () => undefined }));

import bcrypt from "bcryptjs";
import { POST as register } from "@/app/api/auth/register/route";
import { loginStepOneAction } from "@/app/(auth)/login/actions";
import { changeSignupEmailAction, resendVerificationEmailAction, verifyEmailAction } from "@/app/(auth)/verify-email/actions";
import { canonicalEmail } from "@/lib/canonicalEmail";
import { readPendingSignup } from "@/lib/pendingSignup";
import { createSilentCode } from "@/lib/verification";
import { newTag, prisma } from "./helpers";

const tag = newTag("sc");
const email = (n: string) => `${tag}-${n}@example.com`;
const emails: string[] = [];

function post(body: Record<string, unknown>) {
  return register(
    new Request("https://app.test/api/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://app.test", host: "app.test" },
      body: JSON.stringify({ name: "Sam Tester", noPhone: true, website: "", turnstileToken: "t", ...body }),
    }) as never,
  );
}

async function signUp(address: string, password: string, name = "Sam Tester") {
  emails.push(address);
  const res = await post({ email: address, password, name });
  expect(res.status).toBe(201);
  return (await res.json()) as { id: string; claim: string };
}

/** A code carrying the same payload as the newest emailed one: what a person would type from their inbox. */
async function newestCode(address: string, userId: string) {
  const latest = await prisma.verificationCode.findFirst({ where: { email: address, purpose: "EMAIL_VERIFY" }, orderBy: { createdAt: "desc" } });
  expect(readPendingSignup(latest?.payload)).not.toBeNull();
  return (await createSilentCode({ email: address, userId, purpose: "EMAIL_VERIFY", payload: latest!.payload as never })).code;
}

const passwordWorks = async (address: string, password: string) => bcrypt.compare(password, (await prisma.user.findUniqueOrThrow({ where: { email: address } })).passwordHash!);

afterAll(async () => {
  const found = await prisma.user.findMany({ where: { email: { startsWith: tag } }, select: { id: true } });
  const ids = found.map((u) => u.id);
  await prisma.appSetting.deleteMany({ where: { key: { startsWith: "trial-used:" }, AND: [{ key: { contains: tag } }] } });
  await prisma.verificationCode.deleteMany({ where: { email: { startsWith: tag } } });
  await prisma.failedLoginAttempt.deleteMany({ where: { email: { startsWith: tag } } });
  await prisma.notification.deleteMany({ where: { userId: { in: ids } } });
  await prisma.mailMessage.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
});

describe("an honest sign-up keeps its password", () => {
  it("register, then confirm in the same browser: the password works", async () => {
    const address = email("happy");
    const { id, claim } = await signUp(address, "Chosen!pass1");
    const confirmed = await verifyEmailAction(address, await newestCode(address, id), claim);
    expect(confirmed).toMatchObject({ ok: true, passwordForgotten: false });
    expect(await passwordWorks(address, "Chosen!pass1")).toBe(true);
    expect((await prisma.user.findUniqueOrThrow({ where: { email: address } })).emailVerified).not.toBeNull();
  });

  it("closing the tab and logging in to the unconfirmed account hands the new browser a claim that keeps the password", async () => {
    const address = email("login");
    const { id } = await signUp(address, "Chosen!pass1");
    // Back later, in a fresh browser: no claim from the sign-up, but the password is typed again.
    const login = await loginStepOneAction(address, "Chosen!pass1");
    expect(login).toMatchObject({ ok: true, needsEmailVerification: true, claim: expect.any(String) });
    const claim = (login as { claim: string }).claim;
    const confirmed = await verifyEmailAction(address, await newestCode(address, id), claim);
    expect(confirmed).toMatchObject({ ok: true, passwordForgotten: false });
    expect(await passwordWorks(address, "Chosen!pass1")).toBe(true);
  });

  it("fixing a typo'd address carries the claim, so the password is kept at the new address", async () => {
    const address = email("typo");
    const fixed = email("typo-fixed");
    emails.push(fixed);
    const { id } = await signUp(address, "Chosen!pass1");
    const moved = await changeSignupEmailAction(address, "Chosen!pass1", fixed);
    expect(moved).toMatchObject({ ok: true, email: fixed, claim: expect.any(String) });
    const confirmed = await verifyEmailAction(fixed, await newestCode(fixed, id), (moved as { claim: string }).claim);
    expect(confirmed).toMatchObject({ ok: true, passwordForgotten: false });
    expect(await passwordWorks(fixed, "Chosen!pass1")).toBe(true);
  });

  it("an over-long name cannot be used to make the code unreadable: it is refused at sign-up", async () => {
    const address = email("longname");
    const res = await post({ email: address, password: "Stranger!99", name: `Mallory ${"B".repeat(500)}` });
    expect(res.status).toBe(400);
    expect(await prisma.user.count({ where: { email: address } })).toBe(0);
  });
});

describe("a stranger who registered the address FIRST (found by the second security review)", () => {
  it("the owner signs up later and confirms with their claim: the owner's password wins, the stranger's is dead", async () => {
    const address = email("squat1");
    await signUp(address, "Stranger!99", "A Stranger");
    const owner = await signUp(address, "Owner!pass1", "The Owner");
    const confirmed = await verifyEmailAction(address, await newestCode(address, owner.id), owner.claim);
    expect(confirmed).toMatchObject({ ok: true, passwordForgotten: false });
    expect(await passwordWorks(address, "Owner!pass1")).toBe(true);
    expect(await passwordWorks(address, "Stranger!99")).toBe(false);
  });

  it("the stranger logs in with their password to replace the owner's code: the owner still ends up with their own password", async () => {
    const address = email("squat2");
    await signUp(address, "Stranger!99", "A Stranger");
    const owner = await signUp(address, "Owner!pass1", "The Owner");
    // The stranger knows the password on the row at this moment? It is still theirs until the owner confirms. They use it to
    // supersede the owner's code with one carrying THEIR claim.
    const login = await loginStepOneAction(address, "Stranger!99");
    expect(login).toMatchObject({ ok: true, needsEmailVerification: true });

    // The owner enters the newest code (the stranger-triggered one) with the claim from their own registration.
    const confirmed = await verifyEmailAction(address, await newestCode(address, owner.id), owner.claim);
    expect(confirmed).toMatchObject({ ok: true, passwordForgotten: false });
    expect(await passwordWorks(address, "Owner!pass1")).toBe(true);
    expect(await passwordWorks(address, "Stranger!99")).toBe(false);
  });

  it("the owner confirms WITHOUT a claim (another browser): the email is confirmed but the stranger's password is forgotten, so it cannot be used", async () => {
    const address = email("squat3");
    const stranger = await signUp(address, "Stranger!99", "A Stranger");
    const confirmed = await verifyEmailAction(address, await newestCode(address, stranger.id), undefined);
    expect(confirmed).toMatchObject({ ok: true, passwordForgotten: true });
    const row = await prisma.user.findUniqueOrThrow({ where: { email: address } });
    expect(row.emailVerified).not.toBeNull();
    expect(await passwordWorks(address, "Stranger!99")).toBe(false);
    // And no password is known to anyone: the stranger cannot sign in to what the owner just confirmed.
    expect(await loginStepOneAction(address, "Stranger!99")).toEqual({ ok: false, error: "Invalid email or password." });
  });

  it("someone else's claim, or a made-up one, is the same as no claim", async () => {
    const address = email("squat4");
    const stranger = await signUp(address, "Stranger!99", "A Stranger");
    const other = await signUp(email("squat4-other"), "Other!pass12", "Someone Else");
    for (const claim of ["made-up", other.claim]) {
      await prisma.user.update({ where: { email: address }, data: { emailVerified: null, passwordHash: await bcrypt.hash("Stranger!99", 4) } });
      const confirmed = await verifyEmailAction(address, await newestCode(address, stranger.id), claim);
      expect(confirmed).toMatchObject({ ok: true, passwordForgotten: true });
      expect(await passwordWorks(address, "Stranger!99")).toBe(false);
    }
  });

  it("a code with NO payload gets no exception: it forgets the password like any unproven confirmation (an old code, or one made unreadable on purpose)", async () => {
    const address = email("nopayload");
    emails.push(address);
    const squatter = await prisma.user.create({ data: { email: address, name: "A Squatter", passwordHash: await bcrypt.hash("Squatter!77", 4), emailCanonical: canonicalEmail(address) } });
    // The stranger's row exists from before; every code ever sent for it is payload-less.
    const { code } = await createSilentCode({ email: address, userId: squatter.id, purpose: "EMAIL_VERIFY" });
    expect(await verifyEmailAction(address, code)).toMatchObject({ ok: true, passwordForgotten: true });
    expect(await passwordWorks(address, "Squatter!77")).toBe(false);
    expect(await loginStepOneAction(address, "Squatter!77")).toEqual({ ok: false, error: "Invalid email or password." });
  });

  it("Resend on an account whose newest code has no payload does not let the password survive either", async () => {
    const address = email("resend-old");
    emails.push(address);
    const squatter = await prisma.user.create({ data: { email: address, name: "A Squatter", passwordHash: await bcrypt.hash("Squatter!77", 4), emailCanonical: canonicalEmail(address) } });
    await createSilentCode({ email: address, userId: squatter.id, purpose: "EMAIL_VERIFY" });
    expect(await resendVerificationEmailAction(address)).toEqual({ ok: true });
    const newest = await prisma.verificationCode.findFirstOrThrow({ where: { email: address, purpose: "EMAIL_VERIFY" }, orderBy: { createdAt: "desc" } });
    expect(readPendingSignup(newest.payload)).toBeNull();
    // The owner enters that code (no claim): the email is confirmed and the stranger's password is gone.
    const { code } = await createSilentCode({ email: address, userId: squatter.id, purpose: "EMAIL_VERIFY" });
    expect(await verifyEmailAction(address, code, undefined)).toMatchObject({ ok: true, passwordForgotten: true });
    expect(await passwordWorks(address, "Squatter!77")).toBe(false);
  });

  it("the stranger cannot confirm without the inbox: their own claim is useless without the emailed code", async () => {
    const address = email("squat5");
    const stranger = await signUp(address, "Stranger!99", "A Stranger");
    expect(await verifyEmailAction(address, "000000", stranger.claim)).toMatchObject({ ok: false });
    expect((await prisma.user.findUniqueOrThrow({ where: { email: address } })).emailVerified).toBeNull();
  });
});

describe("accounts that are already confirmed are never touched", () => {
  it("a late code with no claim does not clear the password of an account confirmed in the meantime", async () => {
    const address = email("late");
    const { id, claim } = await signUp(address, "Chosen!pass1");
    const late = await newestCode(address, id);
    await prisma.user.update({ where: { id }, data: { emailVerified: new Date() } });
    await verifyEmailAction(address, late, undefined);
    expect(await passwordWorks(address, "Chosen!pass1")).toBe(true);
    void claim;
  });
});

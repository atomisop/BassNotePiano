import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// Sign-up and first-run setup: when the trial starts, a re-register that hits the code limit, fixing a typo'd email, and the
// first-run username and "tell me when it opens" lists. Real rows in a local database; only the sign-in session, the request
// headers and the per-network rate limit are stood in for.
let sessionUserId = "";
vi.mock("@/lib/auth", () => ({
  getServerAuthSession: async () => (sessionUserId ? { user: { id: sessionUserId, role: "STUDENT", onboarded: false } } : null),
  authOptions: {},
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-nf-client-connection-ip": "203.0.113.50" }) }));
vi.mock("@/lib/rateLimit", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/rateLimit")>()), consumeRateLimit: async () => undefined }));
// Behaves exactly like the real one unless a test asks otherwise (to make something happen "in the middle" of a request).
vi.mock("@/lib/verification", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/verification")>();
  return { ...real, createAndSendCode: vi.fn(real.createAndSendCode) };
});

import bcrypt from "bcryptjs";
import { POST as register } from "@/app/api/auth/register/route";
import { changeSignupEmailAction, verifyEmailAction } from "@/app/(auth)/verify-email/actions";
import { checkUsernameAvailableAction, saveOnboardingAction, suggestUsernamesAction } from "@/app/onboarding/actions";
import { canonicalEmail } from "@/lib/canonicalEmail";
import { forgetInstrumentInterest, recordInstrumentInterest, WAITLIST_SOURCE } from "@/lib/instrumentInterest";
import * as verification from "@/lib/verification";
import { createSilentCode, verifyCode } from "@/lib/verification";
import { USERNAME_UNAVAILABLE_MESSAGE, usernameProblem } from "@/lib/usernameRules";
import { newTag, prisma } from "./helpers";

const tag = newTag("sf");
// Usernames are at most 20 characters, so they are built from the end of the tag.
const short = tag.slice(-9);
const email = (n: string) => `${tag}-${n}@example.com`;
const PASSWORD = "Passw0rd!x";
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

async function unverified(name: string, password = PASSWORD) {
  const address = email(name);
  emails.push(address);
  return prisma.user.create({ data: { email: address, name: "Sam Tester", passwordHash: await bcrypt.hash(password, 4), emailCanonical: canonicalEmail(address) } });
}

beforeEach(() => {
  sessionUserId = "";
});

afterAll(async () => {
  const found = await prisma.user.findMany({ where: { email: { startsWith: tag } }, select: { id: true, email: true } });
  const ids = found.map((u) => u.id);
  await prisma.appSetting.deleteMany({ where: { key: { startsWith: "trial-used:" }, value: { not: "" }, AND: [{ key: { contains: tag } }] } });
  await prisma.verificationCode.deleteMany({ where: { email: { startsWith: tag } } });
  await prisma.contact.deleteMany({ where: { email: { startsWith: tag } } });
  await prisma.notification.deleteMany({ where: { userId: { in: ids } } });
  await prisma.mailMessage.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
});

describe("the free trial starts when the email is confirmed, not at sign-up", () => {
  it("a new account has no trial while its code is still unused, and gets it on confirming", async () => {
    const address = email("trial");
    emails.push(address);
    const res = await post({ email: address, password: PASSWORD });
    expect(res.status).toBe(201);

    const before = await prisma.user.findUniqueOrThrow({ where: { email: address } });
    expect(before.emailVerified).toBeNull();
    expect(before.trialEndsAt).toBeNull();

    // The emailed code cannot be read back from here, so issue one the same way and confirm with it.
    const { code } = await createSilentCode({ email: address, userId: before.id, purpose: "EMAIL_VERIFY" });
    const confirmed = await verifyEmailAction(address, code);
    expect(confirmed.ok).toBe(true);

    const after = await prisma.user.findUniqueOrThrow({ where: { email: address } });
    expect(after.emailVerified).not.toBeNull();
    expect(after.trialEndsAt).not.toBeNull();
    // Three days from now, give or take the test's own runtime.
    const days = (after.trialEndsAt!.getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(2.99);
    expect(days).toBeLessThan(3.01);
    await prisma.appSetting.deleteMany({ where: { key: `trial-used:${canonicalEmail(address)}` } });
  });

  it("an account that already had its trial started at sign-up keeps exactly that one", async () => {
    const user = await unverified("early");
    const fixed = new Date(Date.now() + 2 * 86_400_000);
    await prisma.user.update({ where: { id: user.id }, data: { trialEndsAt: fixed } });
    const { code } = await createSilentCode({ email: user.email, userId: user.id, purpose: "EMAIL_VERIFY" });
    expect((await verifyEmailAction(user.email, code)).ok).toBe(true);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).trialEndsAt?.getTime()).toBe(fixed.getTime());
  });
});

describe("registering again over an account that never confirmed", () => {
  it("takes it over with the new password when codes can still be sent", async () => {
    const address = email("again");
    emails.push(address);
    expect((await post({ email: address, password: PASSWORD })).status).toBe(201);
    expect((await post({ email: address, password: "Different!9" })).status).toBe(201);
    const row = await prisma.user.findUniqueOrThrow({ where: { email: address } });
    expect(await bcrypt.compare("Different!9", row.passwordHash!)).toBe(true);
  });

  it("answers 429 and changes nothing when too many codes were already sent (it used to be a bare 500)", async () => {
    const address = email("limit");
    emails.push(address);
    expect((await post({ email: address, password: PASSWORD })).status).toBe(201);
    const row = await prisma.user.findUniqueOrThrow({ where: { email: address } });
    // The sign-up sent one; four more reach the default limit of five in fifteen minutes.
    for (let i = 0; i < 4; i++) await createSilentCode({ email: address, userId: row.id, purpose: "EMAIL_VERIFY" });

    const res = await post({ email: address, password: "Different!9" });
    expect(res.status).toBe(429);
    expect((await res.json()).error).toMatch(/several codes/i);

    const after = await prisma.user.findUniqueOrThrow({ where: { email: address } });
    expect(await bcrypt.compare(PASSWORD, after.passwordHash!)).toBe(true);
    expect(after.sessionVersion).toBe(row.sessionVersion);
  });
});

describe("fixing a typo'd email on the verify screen", () => {
  it("moves the account, kills the old address's code and sends a fresh one", async () => {
    const user = await unverified("typo");
    const oldCode = await createSilentCode({ email: user.email, userId: user.id, purpose: "EMAIL_VERIFY" });
    const fixed = email("typo-fixed");
    emails.push(fixed);

    const result = await changeSignupEmailAction(user.email, PASSWORD, fixed.toUpperCase());
    expect(result).toMatchObject({ ok: true, email: fixed });

    const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(row.email).toBe(fixed);
    expect(row.emailCanonical).toBe(canonicalEmail(fixed));
    expect(row.emailVerified).toBeNull();
    expect((await verifyCode(user.email, "EMAIL_VERIFY", oldCode.code)).ok).toBe(false);
    expect(await prisma.verificationCode.count({ where: { email: fixed, purpose: "EMAIL_VERIFY", consumedAt: null } })).toBe(1);
  });

  it("needs the password, and says the same thing for a wrong one, an unknown address and a confirmed account", async () => {
    const user = await unverified("guard");
    const confirmed = await unverified("confirmed");
    await prisma.user.update({ where: { id: confirmed.id }, data: { emailVerified: new Date() } });
    const target = email("guard-new");

    const wrong = await changeSignupEmailAction(user.email, "not-the-password", target);
    const unknown = await changeSignupEmailAction(email("nobody"), PASSWORD, target);
    const verified = await changeSignupEmailAction(confirmed.email, PASSWORD, target);
    for (const r of [wrong, unknown, verified]) expect(r).toEqual({ ok: false, error: expect.stringMatching(/couldn't change the email/i) });
    expect(wrong).toEqual(unknown);
    expect(wrong).toEqual(verified);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).email).toBe(user.email);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: confirmed.id } })).email).toBe(confirmed.email);
  });

  it("refuses an address that already has an account, a bad address, the same address and a throwaway one", async () => {
    const user = await unverified("refuse");
    const other = await unverified("holder");
    expect(await changeSignupEmailAction(user.email, PASSWORD, other.email)).toEqual({ ok: false, error: expect.stringMatching(/already has an account/i) });
    expect(await changeSignupEmailAction(user.email, PASSWORD, "not an email")).toEqual({ ok: false, error: expect.stringMatching(/valid email/i) });
    expect(await changeSignupEmailAction(user.email, PASSWORD, user.email)).toEqual({ ok: false, error: expect.stringMatching(/already went to/i) });
    expect(await changeSignupEmailAction(user.email, PASSWORD, `${tag}@mailinator.com`)).toEqual({ ok: false, error: expect.stringMatching(/disposable/i) });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).email).toBe(user.email);
  });
});

describe("things that change while a request is in flight (found by the security review)", () => {
  it("moving an account does not go through if it was confirmed during the slow password check", async () => {
    const user = await unverified("race-move");
    const victim = email("race-move-victim");
    // The password comparison is the slow step; confirm the account (its code entered in another tab) while it runs.
    const spy = vi.spyOn(bcrypt, "compare").mockImplementationOnce((async () => {
      await prisma.user.update({ where: { id: user.id }, data: { emailVerified: new Date() } });
      return true;
    }) as never);
    const result = await changeSignupEmailAction(user.email, PASSWORD, victim);
    spy.mockRestore();

    expect(result).toEqual({ ok: false, error: expect.stringMatching(/couldn't change the email/i) });
    const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(row.email).toBe(user.email); // never moved to an address nobody has proved they own
    expect(await prisma.user.count({ where: { email: victim } })).toBe(0);
  });

  it("a code sent to one address cannot confirm an account that has since moved to another", async () => {
    const user = await unverified("race-verify");
    const { code } = await createSilentCode({ email: user.email, userId: user.id, purpose: "EMAIL_VERIFY" });
    const moved = email("race-verify-moved");
    emails.push(moved);
    // The account moves after the code was checked but before it is marked confirmed: same result as the move winning the race.
    await prisma.user.update({ where: { id: user.id }, data: { email: moved, emailCanonical: canonicalEmail(moved) } });

    expect(await verifyEmailAction(user.email, code)).toEqual({ ok: false, error: expect.any(String) });
    const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(row.email).toBe(moved);
    expect(row.emailVerified).toBeNull();
    expect(row.trialEndsAt).toBeNull();
  });

  it("registering over an unconfirmed account cannot overwrite the password if its owner confirmed it while the new code was being sent", async () => {
    const address = email("race-takeover");
    emails.push(address);
    expect((await post({ email: address, password: PASSWORD })).status).toBe(201);
    vi.mocked(verification.createAndSendCode).mockImplementationOnce(async (params) => {
      await prisma.user.update({ where: { email: params.email }, data: { emailVerified: new Date() } });
      return { ok: true };
    });

    const res = await post({ email: address, password: "Stranger!99" });
    expect(res.status).toBe(409);
    const row = await prisma.user.findUniqueOrThrow({ where: { email: address } });
    expect(await bcrypt.compare(PASSWORD, row.passwordHash!)).toBe(true); // still the owner's password
    expect(row.emailVerified).not.toBeNull();
  });
});

describe("first-run username", () => {
  it("refuses at the first step every name the last step would refuse", async () => {
    const me = await unverified("names");
    sessionUserId = me.id;
    for (const name of ["badminton", "systematic", "atomic_fan", "support_team", "ab", "Has Space"]) {
      const result = await checkUsernameAvailableAction(name);
      expect(result.available).toBe(false);
      expect(result.reason).toBe(usernameProblem(name.trim().toLowerCase()));
    }
    // And what it refuses for being reserved, saving refuses with the same words.
    expect(await saveOnboardingAction({ username: "badminton", primaryInstrument: "BASS", skillLevel: null, genres: [], learningGoal: null })).toEqual({ ok: false, error: USERNAME_UNAVAILABLE_MESSAGE });
  });

  it("offers free names built from the student's name, skipping ones someone holds", async () => {
    const me = await prisma.user.create({ data: { email: email("sj"), name: "Sam Jones", passwordHash: "x", username: `m${short}` } });
    sessionUserId = me.id;
    const holder = `samjones`;
    const existing = await prisma.user.findUnique({ where: { username: holder } });
    if (!existing) await prisma.user.create({ data: { email: email("holder2"), name: "Other", passwordHash: "x", username: holder } });

    const taken = await checkUsernameAvailableAction(holder);
    expect(taken.available).toBe(false);
    expect(taken.reason).toBe("Already taken.");
    expect(taken.suggestions?.length).toBeGreaterThan(0);
    expect(taken.suggestions).not.toContain(holder);
    for (const s of taken.suggestions ?? []) expect(usernameProblem(s)).toBeNull();

    const upfront = await suggestUsernamesAction();
    expect(upfront.length).toBeGreaterThan(0);
    expect(upfront).not.toContain(holder);

    expect((await checkUsernameAvailableAction(`f${short}`)).available).toBe(true);
    await prisma.user.deleteMany({ where: { username: holder, email: { startsWith: tag } } });
  });

  it("hands out nothing to someone who is not signed in", async () => {
    expect(await suggestUsernamesAction()).toEqual([]);
  });
});

describe("tell me when drums or vocal open", () => {
  it("saves the student as Other, keeps their place on the owner's People list, and does not duplicate it", async () => {
    const me = await unverified("wait");
    await prisma.user.update({ where: { id: me.id }, data: { phone: null } });
    sessionUserId = me.id;

    const saved = await saveOnboardingAction({ username: `d${short}`, primaryInstrument: null, skillLevel: "BEGINNER", genres: [], learningGoal: null, waitlist: ["DRUMS", "VOCAL"] });
    expect(saved).toEqual({ ok: true });
    const row = await prisma.user.findUniqueOrThrow({ where: { id: me.id } });
    expect(row.primaryInstrument).toBe("OTHER");
    expect(row.onboardedAt).not.toBeNull();

    const contact = await prisma.contact.findFirstOrThrow({ where: { email: me.email } });
    expect(contact).toMatchObject({ source: WAITLIST_SOURCE, instrument: "DRUMS", status: "INTERESTED", skillLevel: "BEGINNER" });
    expect(contact.notes).toContain("Drums and Vocal");

    await recordInstrumentInterest(me.id, ["DRUMS", "VOCAL"]);
    expect(await prisma.contact.count({ where: { email: me.email } })).toBe(1);
  });

  it("ignores instruments we teach and nonsense, so it cannot be used to write arbitrary entries", async () => {
    const me = await unverified("nonsense");
    await recordInstrumentInterest(me.id, ["PIANO_KEYBOARD", "BASS", "x", 4]);
    await recordInstrumentInterest(me.id, "DRUMS");
    expect(await prisma.contact.count({ where: { email: me.email } })).toBe(0);
  });

  it("adds to an entry the owner already made for that email instead of making another, and deleting the account removes only its own", async () => {
    const mine = await unverified("owner-made");
    const made = await prisma.contact.create({ data: { name: "Sam Tester", email: mine.email, notes: "Met at the open day.", source: "walked in" } });
    await recordInstrumentInterest(mine.id, ["VOCAL"]);
    const merged = await prisma.contact.findUniqueOrThrow({ where: { id: made.id } });
    expect(merged.notes).toContain("Met at the open day.");
    expect(merged.notes).toContain("Vocal");
    expect(merged.instrument).toBe("VOCAL");
    expect(await prisma.contact.count({ where: { email: mine.email } })).toBe(1);

    await forgetInstrumentInterest(mine.email);
    expect(await prisma.contact.count({ where: { email: mine.email } })).toBe(1);

    const own = await unverified("own-entry");
    await recordInstrumentInterest(own.id, ["DRUMS"]);
    expect(await prisma.contact.count({ where: { email: own.email } })).toBe(1);
    await forgetInstrumentInterest(own.email);
    expect(await prisma.contact.count({ where: { email: own.email } })).toBe(0);
  });
});

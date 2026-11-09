import { afterAll, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/auth", () => ({ getServerSession: async () => null, getServerAuthSession: async () => null, authOptions: {} }));
import { canonicalEmail } from "@/lib/canonicalEmail";
import { getTrialApplyFacts, submitSignedInApplication } from "@/lib/trialApplication";
import { resetRateLimitBackend } from "@/lib/rateLimit";
import { freshPhone, newTag, prisma } from "./helpers";

// "Ask for a free trial class" on Home, signed in: the same application the public form makes, sent from the account (its email, name and
// phone), so approving it starts the trial on this account. One per person.
const tag = newTag("ta");
const userIds: string[] = [];
async function account(label: string, extra: Record<string, unknown> = {}) {
  const email = `${tag}-${label}@example.test`;
  const u = await prisma.user.create({ data: { email, name: "Trial Tester", passwordHash: "x", emailCanonical: canonicalEmail(email), ...extra } });
  userIds.push(u.id);
  return u;
}

afterAll(async () => {
  await prisma.classRegistration.deleteMany({ where: { OR: [{ userId: { in: userIds } }, { email: { startsWith: tag } }] } });
  await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
});

describe("asking for a free trial class from Home", () => {
  it("sends it from the account, asking only what is missing, and saves the phone to the account", async () => {
    resetRateLimitBackend();
    const me = await account("a");
    expect(await getTrialApplyFacts(me.id)).toEqual({ instrument: null, skillLevel: null, hasPhone: false });
    await expect(submitSignedInApplication(me.id, {})).rejects.toThrow(/instrument/);
    await expect(submitSignedInApplication(me.id, { instrument: "DRUMS", skillLevel: "BEGINNER", phone: freshPhone() })).rejects.toThrow(/instrument/);
    await expect(submitSignedInApplication(me.id, { instrument: "BASS", skillLevel: "BEGINNER" })).rejects.toThrow(/phone/);

    const phone = freshPhone();
    await submitSignedInApplication(me.id, { instrument: "BASS", skillLevel: "BEGINNER", phone, note: "Weekday evenings" });
    const row = await prisma.classRegistration.findFirstOrThrow({ where: { userId: me.id } });
    expect(row).toMatchObject({ email: me.email.toLowerCase(), fullName: "Trial Tester", instrument: "BASS", skillLevel: "BEGINNER", notes: "Weekday evenings", status: "PENDING" });
    const after = await prisma.user.findUniqueOrThrow({ where: { id: me.id } });
    expect(after.phone).toBe(row.phone);
    expect(after.primaryInstrument).toBe("BASS");
    // One per person: Home stops offering it, and the server refuses a second.
    expect(await getTrialApplyFacts(me.id)).toBeNull();
    await expect(submitSignedInApplication(me.id, { note: "again" })).rejects.toThrow(/already have your request/);
  });

  it("uses what the account already has", async () => {
    resetRateLimitBackend();
    const me = await account("b", { phone: freshPhone(), primaryInstrument: "PIANO_KEYBOARD", skillLevel: "INTERMEDIATE" });
    expect(await getTrialApplyFacts(me.id)).toEqual({ instrument: "PIANO_KEYBOARD", skillLevel: "INTERMEDIATE", hasPhone: true });
    await submitSignedInApplication(me.id, {});
    expect(await prisma.classRegistration.findFirstOrThrow({ where: { userId: me.id } })).toMatchObject({ instrument: "PIANO_KEYBOARD", phone: me.phone });
  });

  it("is not for someone who already had a trial or applied on the public form", async () => {
    resetRateLimitBackend();
    const used = await account("c", { trialEndsAt: new Date(Date.now() - 86_400_000) });
    expect(await getTrialApplyFacts(used.id)).toBeNull();
    await expect(submitSignedInApplication(used.id, { instrument: "BASS", skillLevel: "BEGINNER", phone: freshPhone() })).rejects.toThrow(/already had your free trial/);

    const applied = await account("d");
    await prisma.classRegistration.create({ data: { fullName: "Trial Tester", email: applied.email, phone: "+12125550100", instrument: "GUITAR", skillLevel: "BEGINNER", status: "REJECTED" } });
    expect(await getTrialApplyFacts(applied.id)).toBeNull();
    await expect(submitSignedInApplication(applied.id, { instrument: "BASS", skillLevel: "BEGINNER", phone: freshPhone() })).rejects.toThrow(/already asked/);
  });

  it("is limited", async () => {
    resetRateLimitBackend();
    const me = await account("e");
    let limited = false;
    for (let i = 0; i < 7; i++) {
      await submitSignedInApplication(me.id, {}).catch((e: Error) => {
        if (/Too many/.test(e.message)) limited = true;
      });
    }
    expect(limited).toBe(true);
  });
});

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
vi.hoisted(() => {
  process.env.OWNER_EMAIL = "secalert-owner@example.com";
});
vi.mock("@/lib/auth", () => ({ getServerSession: async () => null, getServerAuthSession: async () => null, authOptions: {} }));
import { clearSettingsCache, saveSetting } from "@/lib/siteSettings";
import { sendPasswordChangedEmail } from "@/lib/email";
import { savePhone, removePhone } from "@/lib/phoneVerification";
import { describeDevice, recordSignInDevice } from "@/lib/deviceAlerts";
import { maybeAlertFailedLogins } from "@/lib/loginAlerts";
import { freshPhone, makeUser, newTag, prisma } from "./helpers";

const tag = newTag("sa");
const ids: string[] = [];

// With no mail key the app prints each email instead of sending it; read those lines back.
let printed: string[] = [];
const sent = () =>
  printed
    .join("\n")
    .split("📧")
    .slice(1)
    .map((block) => ({ to: /To:\s+(.*)/.exec(block)?.[1] ?? "", subject: /Subject:\s+(.*)/.exec(block)?.[1] ?? "", text: block }));
beforeEach(() => {
  printed = [];
  vi.spyOn(console, "log").mockImplementation((...a: unknown[]) => void printed.push(a.join(" ")));
});
afterAll(async () => {
  await prisma.notification.deleteMany({ where: { userId: { in: ids } } });
  await prisma.knownDevice.deleteMany({ where: { userId: { in: ids } } });
  await prisma.failedLoginAttempt.deleteMany({ where: { email: { startsWith: tag } } });
  await prisma.appSetting.deleteMany({ where: { key: { in: ["security-alert:failed-logins", "setting:security.failedLoginAlertThreshold"] } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
});
async function person(name: string, extra: Record<string, unknown> = {}) {
  const u = await makeUser(tag, name, extra);
  ids.push(u.id);
  return u;
}
const MAC_CHROME = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const IPHONE_SAFARI = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

describe("password change notice", () => {
  it("tells the owner and carries the reset link", async () => {
    await sendPasswordChangedEmail("pw@example.com", "Pat Lee");
    const [mail] = sent();
    expect(mail.to).toBe("pw@example.com");
    expect(mail.text).toMatch(/password .* was just changed/i);
    expect(mail.text).toContain("/forgot-password");
  });
});

describe("phone change notice", () => {
  it("emails the owner when the number is changed or removed, not when a first number is added", async () => {
    const u = await person("Phone", { phone: null });
    await savePhone(u.id, freshPhone());
    expect(sent()).toEqual([]);
    await savePhone(u.id, freshPhone());
    expect(sent()).toHaveLength(1);
    expect(sent()[0].to).toBe(u.email);
    expect(sent()[0].subject).toBe("The phone number on your account was changed");
    expect(sent()[0].text).toContain("/forgot-password");
    printed = [];
    await removePhone(u.id);
    expect(sent()[0].subject).toBe("The phone number on your account was removed");
  });
  it("does not email when the same number is saved again", async () => {
    const p = freshPhone();
    const u = await person("Phone2", { phone: null });
    await savePhone(u.id, p);
    printed = [];
    await savePhone(u.id, p);
    expect(sent()).toEqual([]);
  });
});

describe("new device sign-in notice", () => {
  it("reads the browser and system, not the address", () => {
    expect(describeDevice(MAC_CHROME).label).toBe("Chrome on Mac");
    expect(describeDevice(IPHONE_SAFARI).label).toBe("Safari on iPhone");
    expect(describeDevice(undefined).label).toBe("an unknown browser on an unknown system");
  });
  it("records the first device quietly, stays quiet for it afterwards, and emails for a new one", async () => {
    const u = await person("Device");
    await recordSignInDevice(u, MAC_CHROME);
    await recordSignInDevice(u, MAC_CHROME);
    expect(sent()).toEqual([]);
    await recordSignInDevice(u, IPHONE_SAFARI);
    const mail = sent();
    expect(mail).toHaveLength(1);
    expect(mail[0].to).toBe(u.email);
    expect(mail[0].text).toContain("Safari on iPhone");
    expect(mail[0].text).toContain("/forgot-password");
    printed = [];
    await recordSignInDevice(u, IPHONE_SAFARI);
    expect(sent()).toEqual([]);
    expect(await prisma.knownDevice.count({ where: { userId: u.id } })).toBe(2);
  });
});

describe("failed sign-in alert to the owner", () => {
  async function setThreshold(n: number) {
    await saveSetting("security.failedLoginAlertThreshold", n);
    clearSettingsCache();
  }
  it("fires once an hour when the limit is passed, and the message names no account", async () => {
    const owner = await prisma.user.create({ data: { email: "secalert-owner@example.com", name: "Owner", passwordHash: "x", role: "ADMIN" } });
    ids.push(owner.id);
    await prisma.appSetting.deleteMany({ where: { key: "security-alert:failed-logins" } });
    await setThreshold(3);
    // The alert counts the whole site, so start from an empty hour (this runs only against a local test database).
    await prisma.failedLoginAttempt.deleteMany({ where: { createdAt: { gte: new Date(Date.now() - 2 * 60 * 60 * 1000) } } });
    await prisma.failedLoginAttempt.createMany({ data: [1, 2].map((i) => ({ email: `${tag}-nobody${i}@example.com` })) });
    expect(await maybeAlertFailedLogins()).toBe(false); // 2 is under 3 (other tests' rows aside, the marker keeps it to one)
    await prisma.failedLoginAttempt.create({ data: { email: `${tag}-nobody3@example.com` } });
    expect(await maybeAlertFailedLogins()).toBe(true);
    expect(await maybeAlertFailedLogins()).toBe(false); // already told within the hour
    const notes = await prisma.notification.findMany({ where: { userId: owner.id, title: "Many failed sign-in attempts" } });
    expect(notes).toHaveLength(1);
    expect(notes[0].body).not.toMatch(/@/);
    expect(notes[0].body).not.toContain(tag);
    // An hour later, with the failures still coming, it can fire again.
    const later = new Date(Date.now() + 61 * 60 * 1000);
    await prisma.failedLoginAttempt.createMany({ data: [1, 2, 3].map((i) => ({ email: `${tag}-later${i}@example.com`, createdAt: later })) });
    expect(await maybeAlertFailedLogins(Date.now() + 61 * 60 * 1000)).toBe(true);
  });
  it("is off when the limit is 0", async () => {
    await prisma.appSetting.deleteMany({ where: { key: "security-alert:failed-logins" } });
    await setThreshold(0);
    expect(await maybeAlertFailedLogins()).toBe(false);
  });
});

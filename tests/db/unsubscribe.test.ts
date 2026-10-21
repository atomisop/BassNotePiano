import { afterAll, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/auth", () => ({ getServerAuthSession: async () => null, authOptions: {} }));
import { POST } from "@/app/api/unsubscribe/route";
import { createNotification } from "@/lib/notifications";
import { unsubscribeLinks } from "@/lib/unsubscribe";
import { makeUser as baseMakeUser, newTag, prisma } from "./helpers";

const tag = newTag("unsub");
// Every email switch on, so a change is visible as a switch going from on to off.
const makeUser = (t: string, name: string) =>
  baseMakeUser(t, name, { notifyEmailPayments: true, notifyEmailRoleUpdates: true, notifyEmailSocial: true, notifyEmailReminders: true, notifyEmailClasses: true });
process.env.NEXTAUTH_URL = "http://localhost:3000";

afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { action: "email.unsubscribe", detail: { in: ["reminders", "classes"] }, actorId: { not: null } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: tag } } });
});

describe("one-click unsubscribe", () => {
  it("a mail app's POST turns off exactly that switch for exactly that person", async () => {
    const me = await makeUser(tag, "Me");
    const other = await makeUser(tag, "Other");
    const links = unsubscribeLinks(me.id, "reminders")!;
    const res = await POST(new Request(links.post, { method: "POST", body: "List-Unsubscribe=One-Click", headers: { "content-type": "application/x-www-form-urlencoded" } }));
    expect(res.status).toBe(200);
    const after = await prisma.user.findUniqueOrThrow({ where: { id: me.id } });
    expect(after.notifyEmailReminders).toBe(false);
    expect(after.notifyEmailPayments).toBe(true); // other switches untouched
    expect((await prisma.user.findUniqueOrThrow({ where: { id: other.id } })).notifyEmailReminders).toBe(true);
  });

  it("a forged or mismatched link changes nothing", async () => {
    const me = await makeUser(tag, "Forged");
    const good = new URL(unsubscribeLinks(me.id, "classes")!.post);
    good.searchParams.set("c", "payments"); // a token made for "classes" must not switch off "payments"
    const res = await POST(new Request(good.toString(), { method: "POST", body: "List-Unsubscribe=One-Click" }));
    expect(res.status).toBe(400);
    const after = await prisma.user.findUniqueOrThrow({ where: { id: me.id } });
    expect(after.notifyEmailPayments).toBe(true);
    expect(after.notifyEmailClasses).toBe(true);
  });

  it("the confirmation page's button redirects back to the page", async () => {
    const me = await makeUser(tag, "Page");
    const l = new URL(unsubscribeLinks(me.id, "classes")!.page);
    const body = new URLSearchParams({ u: me.id, c: "classes", t: l.searchParams.get("t")!, from: "page" }).toString();
    const res = await POST(new Request("http://localhost:3000/api/unsubscribe", { method: "POST", body, headers: { "content-type": "application/x-www-form-urlencoded" } }));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toContain("/unsubscribe?done=classes");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: me.id } })).notifyEmailClasses).toBe(false);
  });

  it("emails a person's switches allow carry the unsubscribe link", async () => {
    const me = await makeUser(tag, "Gets");
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    await createNotification({ userId: me.id, type: "PRACTICE_REMINDER", title: "Practice", body: "Time to practice", emailCategory: "reminders" });
    const printed = log.mock.calls.map((c) => String(c[0])).join("\n");
    log.mockRestore();
    expect(printed).toContain("Unsubscribe: http://localhost:3000/unsubscribe?u=");
    expect(printed).toContain(`c=reminders`);
  });
});

import { afterAll, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/auth", () => ({ getServerAuthSession: async () => null, authOptions: {} }));
import { createNotification } from "@/lib/notifications";
import { makeUser, newTag, prisma } from "./helpers";

const tag = newTag("nh");
const ids: string[] = [];

afterAll(async () => {
  await prisma.notification.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
});

describe("createNotification stores where a tap goes", () => {
  it("an exact href wins, then the button's page, then the type's page, and never an outside link", async () => {
    const u = await makeUser(`${tag}u`, "Some Person");
    ids.push(u.id);
    const make = async (extra: object) => (await createNotification({ userId: u.id, type: "ADMIN_ALERT", title: "t", ...extra }))!;

    const exact = await make({ href: "/admin/users/abc", cta: { label: "x", path: "/admin/payments" } });
    const viaCta = await make({ cta: { label: "x", path: "/admin/payments" } });
    const byType = await make({});
    const outside = await make({ href: "https://evil.com" });

    const hrefs = await prisma.notification.findMany({ where: { id: { in: [exact.id, viaCta.id, byType.id, outside.id] } }, select: { id: true, href: true } });
    const of = (id: string) => hrefs.find((h) => h.id === id)?.href;
    expect(of(exact.id)).toBe("/admin/users/abc");
    expect(of(viaCta.id)).toBe("/admin/payments");
    expect(of(byType.id)).toBe("/admin");
    expect(of(outside.id)).toBe("/admin");
  });
});

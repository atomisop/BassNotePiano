import { afterAll, describe, expect, it } from "vitest";
import { canonicalEmail } from "@/lib/canonicalEmail";
import { bannerSlotId } from "@/lib/bannerSlots";
import { recordBannerNotice } from "@/lib/bannerNotices";
import { newTag, prisma } from "./helpers";

const tag = newTag("bn");
const ids: string[] = [];
async function account(label: string, extra: { discordId?: string } = {}) {
  const email = `${tag}-${label}@example.test`;
  const u = await prisma.user.create({ data: { email, name: "Banner Tester", passwordHash: "x", emailCanonical: canonicalEmail(email), ...extra } });
  ids.push(u.id);
  return u;
}
afterAll(async () => {
  await prisma.notification.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
});

describe("banner reminders kept in the notifications", () => {
  it("records one per banner per slot, and another in the next slot", async () => {
    const u = await account("a");
    const now = new Date();
    const slot = bannerSlotId(now);
    expect(await recordBannerNotice(u.id, "practice", slot, now)).toBe("recorded");
    expect(await recordBannerNotice(u.id, "practice", slot, now)).toBe("already");
    expect(await recordBannerNotice(u.id, "discord", slot, now)).toBe("recorded");
    expect(await prisma.notification.count({ where: { userId: u.id } })).toBe(2);
    // Six hours on is the next slot: the same banner is kept again.
    const later = new Date(now.getTime() + 6 * 3_600_000);
    expect(await recordBannerNotice(u.id, "practice", bannerSlotId(later), later)).toBe("recorded");
    expect(await prisma.notification.count({ where: { userId: u.id, type: "BANNER_PRACTICE" } })).toBe(2);
  });

  it("keeps nothing for something already done, or a slot that is not current", async () => {
    const linked = await account("b", { discordId: `d${tag}` });
    const now = new Date();
    expect(await recordBannerNotice(linked.id, "discord", bannerSlotId(now), now)).toBe("not-needed");
    expect(await recordBannerNotice(linked.id, "practice", new Date(now.getTime() - 20 * 3_600_000).toISOString(), now)).toBe("bad-slot");
    expect(await prisma.notification.count({ where: { userId: linked.id } })).toBe(0);
  });
});

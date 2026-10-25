import { describe, expect, it } from "vitest";
import { bannerSlotId, currentBannerSlot, isCurrentSlotId } from "@/lib/bannerSlots";

const at = (h: number, m = 0, day = 15) => new Date(2026, 9, day, h, m, 0, 0);

describe("banner slots", () => {
  it("are 2am, 8am, 2pm and 8pm, six hours apart", () => {
    expect(currentBannerSlot(at(8, 0)).getHours()).toBe(8);
    expect(currentBannerSlot(at(13, 59)).getHours()).toBe(8);
    expect(currentBannerSlot(at(14, 0)).getHours()).toBe(14);
    expect(currentBannerSlot(at(23, 30)).getHours()).toBe(20);
    expect(currentBannerSlot(at(2, 0)).getHours()).toBe(2);
    expect(currentBannerSlot(at(7, 59)).getHours()).toBe(2);
  });
  it("just after midnight still belongs to last evening's 8pm slot", () => {
    const slot = currentBannerSlot(at(0, 30, 16));
    expect(slot.getDate()).toBe(15);
    expect(slot.getHours()).toBe(20);
  });
  it("gives one id per slot, and four a day", () => {
    const ids = new Set([at(3), at(7), at(9), at(13), at(15), at(19), at(21), at(23)].map(bannerSlotId));
    expect(ids.size).toBe(4);
    expect(bannerSlotId(at(9))).toBe(bannerSlotId(at(12)));
  });
  it("accepts only a slot that started in the last six hours", () => {
    const now = at(15, 0);
    expect(isCurrentSlotId(bannerSlotId(now), now)).toBe(true);
    expect(isCurrentSlotId(at(2).toISOString(), now)).toBe(false);
    expect(isCurrentSlotId(at(16).toISOString(), now)).toBe(false);
    expect(isCurrentSlotId("nonsense", now)).toBe(false);
  });
});

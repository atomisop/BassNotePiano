// When the banners at the top of the app may pop up: four times a day, six hours apart, starting at 8am (8am, 2pm, 8pm and 2am), by the
// viewer's own clock. Each banner shows at most once per slot, and the reminder it stands for is kept in the notifications either way.

export const BANNER_SLOT_HOURS = [2, 8, 14, 20] as const;
const HOUR = 3_600_000;

/** The start of the slot `now` is in: the latest of 2am, 8am, 2pm, 8pm (local time) at or before it. */
export function currentBannerSlot(now: Date): Date {
  const candidates: Date[] = [];
  for (const dayOffset of [-1, 0]) {
    for (const hour of BANNER_SLOT_HOURS) candidates.push(new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayOffset, hour, 0, 0, 0));
  }
  return candidates.filter((c) => c.getTime() <= now.getTime()).sort((a, b) => b.getTime() - a.getTime())[0];
}

/** A slot's id as stored in the browser and sent to the server. */
export function bannerSlotId(now: Date): string {
  return currentBannerSlot(now).toISOString();
}

/** The server's check that a slot id from a browser is a real, current slot (started within the last six hours, never in the future). */
export function isCurrentSlotId(id: string, now: Date): boolean {
  const t = new Date(id).getTime();
  return Number.isFinite(t) && t <= now.getTime() && now.getTime() - t < 6 * HOUR + 60_000;
}

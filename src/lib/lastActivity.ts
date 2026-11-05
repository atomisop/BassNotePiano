/**
 * When a student was last seen.
 *
 * `User.lastActivityDate` was only ever written by the old streak code, which nothing calls any more, so it is null for
 * almost everyone and the admin student page said "Last active: Never" next to a live streak (2026-11-02 audit). The real
 * signal is the newest `KnownDevice.lastSeenAt`, which the shared status poll touches about once a minute per open tab.
 * The old column still wins for an account that was active before devices were recorded. Pure, so it is tested.
 */
export function latestActivity(deviceSeenAt: Date | null | undefined, legacy: Date | null | undefined): Date | null {
  const a = deviceSeenAt ?? null;
  const b = legacy ?? null;
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}

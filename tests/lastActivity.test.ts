import { describe, expect, it } from "vitest";
import { latestActivity } from "@/lib/lastActivity";

describe("latestActivity", () => {
  it("is null when nothing was ever recorded", () => {
    expect(latestActivity(null, null)).toBeNull();
    expect(latestActivity(undefined, undefined)).toBeNull();
  });

  it("uses whichever source exists", () => {
    const d = new Date("2026-11-01T10:00:00Z");
    expect(latestActivity(d, null)).toEqual(d);
    expect(latestActivity(null, d)).toEqual(d);
  });

  it("picks the newer of a device check-in and the old activity column", () => {
    const device = new Date("2026-11-02T09:00:00Z");
    const legacy = new Date("2026-08-26T04:28:59Z");
    expect(latestActivity(device, legacy)).toEqual(device);
    expect(latestActivity(legacy, device)).toEqual(device);
  });
});

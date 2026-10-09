import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/siteSettings", () => ({ getBoolSetting: async () => true, getNumberSetting: async () => 0, getTextSetting: async () => "" }));
import { resolveDurationMin } from "@/lib/classScheduleManage";
import { chunksForSchedule } from "@/lib/classSchedule";

describe("posting a schedule window", () => {
  it("accepts a single 45-minute class", () => {
    expect(resolveDurationMin("17:00", "17:45")).toBe(45);
    expect(chunksForSchedule({ durationMin: 45 })).toHaveLength(1);
  });
  it("accepts other 15-minute steps, and still fits only whole classes", () => {
    expect(resolveDurationMin("17:00", "18:45")).toBe(105);
    expect(chunksForSchedule({ durationMin: 105 })).toHaveLength(2);
  });
  it("refuses anything shorter than a class or off the 15-minute grid", () => {
    expect(() => resolveDurationMin("17:00", "17:30")).toThrow(/at least 45/);
    expect(() => resolveDurationMin("17:00", "18:10")).toThrow(/multiple of 15/);
  });
});

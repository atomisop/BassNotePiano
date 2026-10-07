import { describe, expect, it } from "vitest";
import { minutesLeft, practiceHref, safePracticeNext } from "@/lib/fingerPracticeConstants";
import { putFingerPracticeFirst, type NextStep } from "@/lib/next-step";

const lesson: NextStep = {
  kind: "read-module",
  scale: { scaleGroup: { slug: "the-major-scale", title: "The Major Scale", kinitName: "Tizita" } } as unknown as NextStep["scale"],
  action: "Work through the module",
  detail: "Start with the lessons.",
  href: "/scales/the-major-scale",
  cta: "Start this scale",
};

describe("safePracticeNext", () => {
  it("accepts only a scale page", () => {
    expect(safePracticeNext("/scales/the-major-scale")).toBe("/scales/the-major-scale");
    expect(safePracticeNext("/scales/a")).toBe("/scales/a");
  });
  it("refuses anything that could bounce the student elsewhere", () => {
    for (const bad of ["https://evil.com", "//evil.com", "/billing/plans", "/scales/", "/scales/x/../../admin", "/scales/x?y=1", "javascript:alert(1)", "", null, undefined]) {
      expect(safePracticeNext(bad as string | null | undefined)).toBeNull();
    }
  });
});

describe("practiceHref", () => {
  it("carries the lesson to return to", () => {
    expect(practiceHref("/scales/the-major-scale")).toBe("/practice?next=%2Fscales%2Fthe-major-scale");
    expect(practiceHref("https://evil.com")).toBe("/practice");
    expect(practiceHref(null)).toBe("/practice");
  });
});

describe("minutesLeft", () => {
  it("rounds up and never goes below zero", () => {
    expect(minutesLeft(0)).toBe(10);
    expect(minutesLeft(61)).toBe(9);
    expect(minutesLeft(600)).toBe(0);
    expect(minutesLeft(9999)).toBe(0);
  });
});

describe("putFingerPracticeFirst", () => {
  it("sends a student with practice left to the exercises, naming the lesson they return to", () => {
    const out = putFingerPracticeFirst(lesson, { required: true, completedToday: false, minutesLeft: 7 });
    expect(out.href).toBe("/practice?next=%2Fscales%2Fthe-major-scale");
    expect(out.cta).toBe("Start finger exercises");
    expect(out.detail).toContain("7 minutes left");
    expect(out.detail).toContain("Tizita");
  });
  it("says 1 minute, singular", () => {
    expect(putFingerPracticeFirst(lesson, { required: true, completedToday: false, minutesLeft: 1 }).detail).toContain("1 minute left");
  });
  it("leaves the step alone once practice is done, for admins, and for non-lesson steps", () => {
    expect(putFingerPracticeFirst(lesson, { required: true, completedToday: true, minutesLeft: 0 })).toBe(lesson);
    expect(putFingerPracticeFirst(lesson, { required: false, completedToday: false, minutesLeft: 10 })).toBe(lesson);
    const plans: NextStep = { ...lesson, kind: "buy-curriculum", href: "/billing/plans" };
    expect(putFingerPracticeFirst(plans, { required: true, completedToday: false, minutesLeft: 10 })).toBe(plans);
  });
});

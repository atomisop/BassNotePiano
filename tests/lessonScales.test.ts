import { describe, expect, it } from "vitest";
import { lessonScaleLabel, pickLessonScale } from "@/lib/lessonScales";

const scales = [
  { slug: "major-scale", code: "Scale 1", title: "Major", roadmapName: "Scales", roadmapHidden: false },
  { slug: "scale-new", code: "Scale 1", title: "New one", roadmapName: "Guitar", roadmapHidden: true },
];

describe("the Lessons scale picker", () => {
  it("opens the scale asked for, including one added on Roadmaps", () => {
    expect(pickLessonScale(scales, "scale-new")?.slug).toBe("scale-new");
  });
  it("falls back to the first scale for an unknown one, and to nothing when there are none", () => {
    expect(pickLessonScale(scales, "gone")?.slug).toBe("major-scale");
    expect(pickLessonScale(scales, undefined)?.slug).toBe("major-scale");
    expect(pickLessonScale([], "x")).toBeNull();
  });
  it("names the roadmap only when there is more than one, and marks a hidden one", () => {
    expect(lessonScaleLabel(scales[0], false)).toBe("Scale 1 · Major");
    expect(lessonScaleLabel(scales[1], true)).toBe("Guitar · Scale 1 · New one (hidden)");
  });
});

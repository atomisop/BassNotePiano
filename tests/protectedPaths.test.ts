import { describe, expect, it } from "vitest";
import { isProtectedPath } from "@/lib/csp";

describe("isProtectedPath", () => {
  it("guards the roadmap and streak screens", () => {
    expect(isProtectedPath("/roadmap")).toBe(true);
    expect(isProtectedPath("/streak")).toBe(true);
    expect(isProtectedPath("/roadmapx")).toBe(false);
  });
});

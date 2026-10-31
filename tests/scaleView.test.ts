import { describe, expect, it } from "vitest";
import { parseScaleView, scaleViewCookie } from "@/lib/scaleView";

describe("scale view", () => {
  it("accepts only the two real layouts", () => {
    expect(parseScaleView("grid")).toBe("grid");
    expect(parseScaleView("list")).toBe("list");
    expect(parseScaleView("table")).toBeNull();
    expect(parseScaleView("")).toBeNull();
    expect(parseScaleView(undefined)).toBeNull();
    expect(parseScaleView(null)).toBeNull();
  });
  it("writes a year-long cookie for the whole site", () => {
    expect(scaleViewCookie("list")).toBe("bnp-scales-view=list; path=/; max-age=31536000; samesite=lax");
  });
});

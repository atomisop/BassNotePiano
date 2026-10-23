import { describe, expect, it } from "vitest";
import { ignoresMainScroll, readPositions, scrollKey, shouldShowBackToTop, withPosition } from "@/lib/scrollAssist";

describe("shouldShowBackToTop", () => {
  it("appears only after about a screen and a half", () => {
    expect(shouldShowBackToTop(0, 800)).toBe(false);
    expect(shouldShowBackToTop(1200, 800)).toBe(false);
    expect(shouldShowBackToTop(1201, 800)).toBe(true);
  });
  it("never shows for an area with no height", () => {
    expect(shouldShowBackToTop(5000, 0)).toBe(false);
  });
});

describe("scrollKey", () => {
  it("separates the same page with a different query", () => {
    expect(scrollKey("/lessons", "")).toBe("/lessons");
    expect(scrollKey("/lessons", "?tab=extra")).toBe("/lessons?tab=extra");
    expect(scrollKey("/lessons", "tab=extra")).toBe("/lessons?tab=extra");
  });
});

describe("ignoresMainScroll", () => {
  it("skips the messages screens, which have their own panes", () => {
    expect(ignoresMainScroll("/messages")).toBe(true);
    expect(ignoresMainScroll("/messages/abc")).toBe(true);
    expect(ignoresMainScroll("/messagesx")).toBe(false);
    expect(ignoresMainScroll("/lessons")).toBe(false);
  });
});

describe("positions", () => {
  it("reads bad or missing storage as empty", () => {
    expect(readPositions(null)).toEqual({});
    expect(readPositions("not json")).toEqual({});
    expect(readPositions('{"/a":12,"/b":"x","/c":-4}')).toEqual({ "/a": 12 });
  });
  it("remembers a position, rounds it, and forgets a page back at the top", () => {
    const one = withPosition({}, "/a", 120.6);
    expect(one).toEqual({ "/a": 121 });
    expect(withPosition(one, "/a", 0)).toEqual({});
  });
  it("keeps only the most recent pages", () => {
    let positions = {};
    for (let i = 0; i < 60; i++) positions = withPosition(positions, `/p${i}`, 100 + i);
    const keys = Object.keys(positions);
    expect(keys).toHaveLength(40);
    expect(keys[0]).toBe("/p20");
    expect(keys.at(-1)).toBe("/p59");
  });
});

import { describe, expect, it } from "vitest";
import { HOME_SCREEN_STEPS, detectPlatform, shouldPromptAddToHome } from "@/lib/addToHome";

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1";
const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36";
const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15";
const WINDOWS = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36";

describe("detectPlatform", () => {
  it("recognizes phones and tablets", () => {
    expect(detectPlatform(IPHONE)).toBe("ios");
    expect(detectPlatform(ANDROID)).toBe("android");
    expect(detectPlatform(MAC, 5)).toBe("ios"); // an iPad that reports itself as a Mac
  });
  it("leaves computers alone", () => {
    expect(detectPlatform(MAC, 0)).toBe("other");
    expect(detectPlatform(WINDOWS)).toBe("other");
  });
});

describe("shouldPromptAddToHome", () => {
  it("asks only on a phone, once, and not from the Home Screen", () => {
    expect(shouldPromptAddToHome({ platform: "ios", standalone: false, seen: false })).toBe(true);
    expect(shouldPromptAddToHome({ platform: "android", standalone: false, seen: false })).toBe(true);
    expect(shouldPromptAddToHome({ platform: "ios", standalone: true, seen: false })).toBe(false);
    expect(shouldPromptAddToHome({ platform: "ios", standalone: false, seen: true })).toBe(false);
    expect(shouldPromptAddToHome({ platform: "other", standalone: false, seen: false })).toBe(false);
  });
  it("has steps for both phones", () => {
    expect(HOME_SCREEN_STEPS.ios.length).toBeGreaterThanOrEqual(3);
    expect(HOME_SCREEN_STEPS.android.length).toBeGreaterThanOrEqual(3);
  });
});

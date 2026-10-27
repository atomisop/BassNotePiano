import { afterEach, describe, expect, it, vi } from "vitest";
import { appEnv, isStaging, stagingMayEmail } from "@/lib/appEnv";

afterEach(() => vi.unstubAllEnvs());

describe("which copy of the app this is", () => {
  it("is staging only when told so, and otherwise follows NODE_ENV", () => {
    vi.stubEnv("APP_ENV", "staging");
    expect(isStaging()).toBe(true);
    vi.stubEnv("APP_ENV", "");
    vi.stubEnv("NEXT_PUBLIC_APP_ENV", "");
    vi.stubEnv("NODE_ENV", "production");
    expect(appEnv()).toBe("production");
    expect(isStaging()).toBe(false);
    vi.stubEnv("NODE_ENV", "development");
    expect(appEnv()).toBe("development");
  });
  it("lets staging email only the test addresses and the allow-list", () => {
    expect(stagingMayEmail("kid@bnp-test.local")).toBe(true);
    expect(stagingMayEmail("someone@example.test")).toBe(true);
    expect(stagingMayEmail("real.student@gmail.com")).toBe(false);
    expect(stagingMayEmail("owner@gmail.com", "owner@gmail.com")).toBe(true);
    expect(stagingMayEmail("a@team.co", "@team.co")).toBe(true);
    expect(stagingMayEmail("a@team.com", "@team.co")).toBe(false);
  });
});

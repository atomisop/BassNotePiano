import { afterEach, describe, expect, it, vi } from "vitest";
import { keyFromPublicUrl } from "./storage";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("keyFromPublicUrl", () => {
  it("returns null when R2_PUBLIC_URL isn't configured", () => {
    vi.stubEnv("R2_PUBLIC_URL", "");
    expect(keyFromPublicUrl("https://cdn.example.com/lessons/scale-1/file.mp4")).toBeNull();
  });

  it("extracts the key from a URL under the configured public base", () => {
    vi.stubEnv("R2_PUBLIC_URL", "https://cdn.example.com");
    expect(keyFromPublicUrl("https://cdn.example.com/lessons/scale-1/123-file.mp4")).toBe(
      "lessons/scale-1/123-file.mp4",
    );
  });

  it("tolerates a trailing slash on the configured base", () => {
    vi.stubEnv("R2_PUBLIC_URL", "https://cdn.example.com/");
    expect(keyFromPublicUrl("https://cdn.example.com/lessons/scale-1/file.mp4")).toBe("lessons/scale-1/file.mp4");
  });

  it("returns null for a URL that isn't under the configured base", () => {
    vi.stubEnv("R2_PUBLIC_URL", "https://cdn.example.com");
    expect(keyFromPublicUrl("https://other-host.com/lessons/scale-1/file.mp4")).toBeNull();
  });

  it("returns null for the bare base URL with no key after it", () => {
    vi.stubEnv("R2_PUBLIC_URL", "https://cdn.example.com");
    expect(keyFromPublicUrl("https://cdn.example.com")).toBeNull();
  });
});

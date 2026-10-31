import { describe, expect, it } from "vitest";
import { isStale } from "@/lib/useSwr";

describe("isStale", () => {
  it("a missing copy is stale; a fresh one is not; an old one is", () => {
    expect(isStale(undefined, 1000, 500)).toBe(true);
    expect(isStale({ at: 900 }, 1000, 500)).toBe(false);
    expect(isStale({ at: 400 }, 1000, 500)).toBe(true);
    expect(isStale({ at: 500 }, 1000, 500)).toBe(true);
  });
});

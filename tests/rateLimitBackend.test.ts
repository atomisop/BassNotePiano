import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const limit = vi.fn();
vi.mock("@upstash/redis", () => ({ Redis: class {} }));
vi.mock("@upstash/ratelimit", () => {
  class Ratelimit {
    static slidingWindow = (max: number, window: string) => ({ max, window });
    constructor(public cfg: unknown) {}
    limit = (...a: unknown[]) => limit(...a);
  }
  return { Ratelimit };
});

import { RateLimitError, consumeRateLimit, resetRateLimitBackend } from "@/lib/rateLimit";

function fakeDb(count: number) {
  return { rateLimitEvent: { create: vi.fn(async () => undefined), count: vi.fn(async () => count), deleteMany: vi.fn(async () => undefined) } };
}
const opts = { windowMinutes: 10, max: 3, message: "slow down" };

describe("consumeRateLimit backends", () => {
  beforeEach(() => {
    limit.mockReset();
    resetRateLimitBackend();
  });
  afterEach(() => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    resetRateLimitBackend();
  });

  it("without Redis keys it records first, then counts, in the database", async () => {
    const db = fakeDb(4);
    await expect(consumeRateLimit(db, "k", opts)).rejects.toThrow("slow down");
    expect(db.rateLimitEvent.create).toHaveBeenCalledBefore(db.rateLimitEvent.count);
    await expect(consumeRateLimit(fakeDb(3), "k", opts)).resolves.toBeUndefined();
    expect(limit).not.toHaveBeenCalled();
  });

  it("with Redis keys it uses Redis and leaves the database alone", async () => {
    process.env.UPSTASH_REDIS_REST_URL = "https://x.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "t";
    const db = fakeDb(0);
    limit.mockResolvedValueOnce({ success: true }).mockResolvedValueOnce({ success: false });
    await expect(consumeRateLimit(db, "k", opts)).resolves.toBeUndefined();
    await expect(consumeRateLimit(db, "k", opts)).rejects.toBeInstanceOf(RateLimitError);
    expect(db.rateLimitEvent.create).not.toHaveBeenCalled();
  });

  it("falls back to the database counting when Redis does not answer", async () => {
    process.env.UPSTASH_REDIS_REST_URL = "https://x.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "t";
    limit.mockRejectedValue(new Error("network down"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const db = fakeDb(9);
    await expect(consumeRateLimit(db, "k", opts)).rejects.toThrow("slow down");
    expect(db.rateLimitEvent.create).toHaveBeenCalled();
  });
});

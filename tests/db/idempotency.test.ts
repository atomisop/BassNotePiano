import { afterAll, describe, expect, it } from "vitest";
import { purgeOldIdempotencyKeys, runOnce } from "@/lib/idempotency";
import { newTag, prisma } from "./helpers";

const tag = newTag("id");
const ids: string[] = [];
afterAll(async () => {
  await prisma.idempotencyKey.deleteMany({ where: { userId: { in: ids } } });
});
const user = () => {
  const id = `${tag}u${ids.length}`;
  ids.push(id);
  return id;
};
type R = { ok: boolean; n: number };
const opts = { isSuccess: (r: R) => r.ok, whileRunning: { ok: false, n: -1 } as R };

describe("runOnce", () => {
  it("runs the work once and hands the same answer to a repeat with the same key", async () => {
    const u = user();
    let runs = 0;
    const work = async (): Promise<R> => ({ ok: true, n: ++runs });
    const first = await runOnce(u, "t", "key-aaaaaaaa", work, opts);
    const again = await runOnce(u, "t", "key-aaaaaaaa", work, opts);
    expect(runs).toBe(1);
    expect(again).toEqual(first);
  });

  it("two taps at once run it once; the second is told to wait", async () => {
    const u = user();
    let runs = 0;
    const slow = async (): Promise<R> => {
      await new Promise((r) => setTimeout(r, 150));
      return { ok: true, n: ++runs };
    };
    const [a, b] = await Promise.all([runOnce(u, "t", "key-bbbbbbbb", slow, opts), runOnce(u, "t", "key-bbbbbbbb", slow, opts)]);
    expect(runs).toBe(1);
    expect([a, b].filter((r) => r.n === -1)).toHaveLength(1);
  });

  it("a failed try releases the key so the person can try again with it", async () => {
    const u = user();
    let runs = 0;
    const fails = async (): Promise<R> => ({ ok: false, n: ++runs });
    await runOnce(u, "t", "key-cccccccc", fails, opts);
    const ok = await runOnce(u, "t", "key-cccccccc", async () => ({ ok: true, n: ++runs }), opts);
    expect(ok).toEqual({ ok: true, n: 2 });
    await expect(runOnce(u, "t", "key-dddddddd", async () => { throw new Error("boom"); }, opts)).rejects.toThrow("boom");
    expect(await prisma.idempotencyKey.count({ where: { userId: u, key: "key-dddddddd" } })).toBe(0);
  });

  it("keys are per person and per kind of action, and a missing or odd key just runs", async () => {
    const [a, b] = [user(), user()];
    let runs = 0;
    const work = async (): Promise<R> => ({ ok: true, n: ++runs });
    await runOnce(a, "t", "key-eeeeeeee", work, opts);
    await runOnce(b, "t", "key-eeeeeeee", work, opts);
    await runOnce(a, "other", "key-eeeeeeee", work, opts);
    expect(runs).toBe(3);
    await runOnce(a, "t", undefined, work, opts);
    await runOnce(a, "t", "x", work, opts);
    expect(runs).toBe(5);
  });

  it("purges keys older than a week", async () => {
    const u = user();
    await prisma.idempotencyKey.create({ data: { userId: u, scope: "t", key: "key-old-0001", createdAt: new Date(Date.now() - 9 * 86_400_000) } });
    await runOnce(u, "t", "key-new-0001", async () => ({ ok: true, n: 1 }), opts);
    expect(await purgeOldIdempotencyKeys()).toBeGreaterThanOrEqual(1);
    expect(await prisma.idempotencyKey.count({ where: { userId: u } })).toBe(1);
  });
});

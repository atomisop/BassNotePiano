import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const KEY_PATTERN = /^[A-Za-z0-9_-]{8,80}$/;

/** True for a key the browser could have made (a UUID or similar); anything else is ignored rather than trusted. */
export function isValidIdempotencyKey(key: unknown): key is string {
  return typeof key === "string" && KEY_PATTERN.test(key);
}

/**
 * Runs `work` at most once for this (person, kind of action, key) while it keeps succeeding.
 * - No key (an older page, a script): just runs it.
 * - First time: runs it; a success is stored and returned, a failure releases the key so the person can fix something and try again.
 * - Same key again after a success: returns the stored reply without running anything.
 * - Same key again while the first is still running (a double tap): returns `whileRunning`.
 */
export async function runOnce<T extends object>(
  userId: string,
  scope: string,
  key: string | undefined,
  work: () => Promise<T>,
  options: { isSuccess: (result: T) => boolean; whileRunning: T },
): Promise<T> {
  if (!isValidIdempotencyKey(key)) return work();

  let rowId: string;
  try {
    rowId = (await prisma.idempotencyKey.create({ data: { userId, scope, key } })).id;
  } catch (err) {
    if ((err as { code?: string })?.code !== "P2002") throw err;
    const existing = await prisma.idempotencyKey.findUnique({ where: { userId_scope_key: { userId, scope, key } } });
    if (existing?.response !== undefined && existing?.response !== null) return existing.response as T;
    return options.whileRunning;
  }

  try {
    const result = await work();
    if (options.isSuccess(result)) {
      await prisma.idempotencyKey.update({ where: { id: rowId }, data: { response: result as unknown as Prisma.InputJsonValue } });
    } else {
      await prisma.idempotencyKey.delete({ where: { id: rowId } }).catch(() => undefined);
    }
    return result;
  } catch (err) {
    await prisma.idempotencyKey.delete({ where: { id: rowId } }).catch(() => undefined);
    throw err;
  }
}

/** Removes keys older than a week; called from the daily job. */
export async function purgeOldIdempotencyKeys(now = new Date()): Promise<number> {
  const result = await prisma.idempotencyKey.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - 7 * 86_400_000) } } });
  return result.count;
}

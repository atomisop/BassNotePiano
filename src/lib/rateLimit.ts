/**
 * STEP 20 — RATE LIMITING, extended.
 *
 * Step 5 already solved this once, narrowly, inside verification.ts: count
 * recent rows in a table the action already writes to, over a time window,
 * using that table's own `createdAt` — no new schema, no Redis. That
 * comment explicitly called out not "standing up a new rate-limit table."
 * This is that same pattern, generalized into one reusable function instead
 * of copy-pasting the count-and-compare logic at every call site — "one
 * centralized rate-limit system," per the master doc, not six bespoke ones
 * that happen to look similar.
 *
 * Deliberately NOT applied to search (searchUsersForMessaging, searchUsers,
 * searchUsersByUsername) or uploads (createPresignedLessonUpload/Avatar):
 * neither has a natural backing table with a per-user timestamp to count
 * against — a search result and a presigned URL are never persisted
 * anywhere. Covering those would mean a genuinely new table (a real
 * schema/migration decision against a database this session hasn't
 * confirmed is safe to migrate), not reusing what already exists, so it's
 * flagged as a follow-up rather than done here.
 */

export class RateLimitError extends Error {
  constructor(message = "You're doing that too often. Please wait a few minutes and try again.") {
    super(message);
    this.name = "RateLimitError";
  }
}

interface RateLimitOptions {
  /** Minutes of history to count. */
  windowMinutes: number;
  /** Requests allowed in that window before this throws. */
  max: number;
  /** Overrides the generic message with something specific to the action. */
  message?: string;
  /** The row's own "when did this happen" column. Defaults to `createdAt` —
   *  override for an action that updates an existing row rather than
   *  inserting a new one each time (e.g. payment resubmission touches
   *  `submittedAt`, not `createdAt`, on an already-existing row). */
  timestampField?: string;
}

/**
 * Throws RateLimitError if `count(where + recent timestamp)` has already hit
 * `max` within `windowMinutes`. `count` is a bound Prisma delegate method —
 * pass `prisma.message.count` itself, not a call to it — so this stays
 * table-agnostic instead of taking a model name and switching on it.
 */
export async function assertRateLimit(
  count: (args: { where: Record<string, unknown> }) => Promise<number>,
  where: Record<string, unknown>,
  { windowMinutes, max, message, timestampField = "createdAt" }: RateLimitOptions,
): Promise<void> {
  const windowStart = new Date(Date.now() - windowMinutes * 60 * 1000);
  const recent = await count({ where: { ...where, [timestampField]: { gte: windowStart } } });
  if (recent >= max) throw new RateLimitError(message);
}

/**
 * Best-effort caller IP. Prefers Netlify's own client-IP header (set by the
 * platform, not appended to a caller-supplied value), then the first
 * x-forwarded-for entry. "unknown" collapses every unidentifiable caller
 * into one shared bucket, which fails closed (stricter) rather than open.
 */
export function clientIpFrom(h: Headers): string {
  return h.get("x-nf-client-connection-ip")?.trim() || h.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

/**
 * Rate limit for endpoints with no table of their own to count against.
 * Records this attempt FIRST, then counts the window and throws if it went
 * over `max`: counting before inserting lets a burst of parallel requests
 * all read a count below the limit and all pass. Every call is recorded,
 * success or not, since a bot's failed attempts are the point.
 */
export async function consumeRateLimit(
  prisma: {
    rateLimitEvent: {
      count: (args: { where: Record<string, unknown> }) => Promise<number>;
      create: (args: { data: { key: string } }) => Promise<unknown>;
      deleteMany: (args: { where: Record<string, unknown> }) => Promise<unknown>;
    };
  },
  key: string,
  { windowMinutes, max, message }: Omit<RateLimitOptions, "timestampField">,
): Promise<void> {
  await prisma.rateLimitEvent.create({ data: { key } });
  const recent = await prisma.rateLimitEvent.count({
    where: { key, createdAt: { gte: new Date(Date.now() - windowMinutes * 60 * 1000) } },
  });
  if (recent > max) throw new RateLimitError(message);
  // ~1% of calls sweep rows past the longest window anyone uses (a day).
  if (Math.random() < 0.01) {
    await prisma.rateLimitEvent
      .deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } } })
      .catch(() => undefined);
  }
}

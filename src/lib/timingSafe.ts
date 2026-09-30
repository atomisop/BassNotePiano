/**
 * A fixed floor under how long an async operation can appear to take. Runs
 * `work` and a plain timer concurrently and waits for both, so the caller
 * sees the same wall-clock time no matter which internal branch `work`
 * took — including a branch that threw.
 *
 * Built for the account-existence-adjacent Server Actions in (auth): each
 * one does a fast early-return when a looked-up email has no account, but
 * slow work (a bcrypt compare, or a real Resend API call) when it does.
 * The response body is identical either way, but without this, response
 * TIME alone would tell an attacker whether an email is registered.
 *
 * `Promise.allSettled` (not `Promise.all`) is what makes the floor hold on
 * the error path too — `Promise.all` resolves the instant `work` rejects,
 * without waiting out the rest of the timer, reopening the exact gap this
 * exists to close.
 *
 * This narrows the two branches toward each other, it doesn't cap them: a
 * slow branch that genuinely runs past `floorMs` (a slow network hop to
 * Resend, a loaded server) still takes as long as it takes. `TIMING_FLOOR_MS`
 * just needs to sit comfortably above the slow branch's TYPICAL latency, not
 * its worst case, or it stops functioning as a floor at all.
 */
export async function withTimingFloor<T>(work: () => Promise<T>, floorMs: number = TIMING_FLOOR_MS): Promise<T> {
  const [workOutcome] = await Promise.allSettled([
    work(),
    new Promise<void>((resolve) => setTimeout(resolve, floorMs)),
  ]);

  if (workOutcome.status === "rejected") throw workOutcome.reason;
  return workOutcome.value;
}

/**
 * 600ms. Measured against this repo's real dependencies, not guessed:
 * bcryptjs (the pure-JS implementation this project uses — meaningfully
 * slower than a native bcrypt binding) at cost 12 — the cost this repo
 * hashes with (see resetPasswordAction) — benchmarked at a 303ms median
 * and 321ms max compare time on ordinary dev hardware. A real Resend API
 * round trip typically lands in a similar few-hundred-ms range. 600ms
 * gives roughly 2x headroom over the measured bcrypt max while staying
 * short enough to be unnoticeable on a form submit.
 */
export const TIMING_FLOOR_MS = 600;

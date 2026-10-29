/**
 * Pure rules for the studio leaderboard: who is on it and in what place. Ranked by practice minutes this week; the same minutes
 * share a place, and the next place skips (two people at 1st, then 3rd), like a sports table.
 */

export function rankLeaderboard<T extends { userId: string; minutes: number; name: string }>(entries: T[]): (T & { place: number })[] {
  const sorted = entries.filter((x) => x.minutes > 0).sort((a, b) => b.minutes - a.minutes || a.name.localeCompare(b.name));
  let place = 0;
  return sorted.map((row, i) => {
    if (i === 0 || row.minutes !== sorted[i - 1].minutes) place = i + 1;
    return { ...row, place };
  });
}

/** The first `count` rows, plus my own row when I am on the board but below them. */
export function topWithMe<T extends { userId: string }>(ranked: T[], count: number, meId: string): { top: T[]; me: T | null } {
  const top = ranked.slice(0, count);
  if (top.some((r) => r.userId === meId)) return { top, me: null };
  return { top, me: ranked.find((r) => r.userId === meId) ?? null };
}

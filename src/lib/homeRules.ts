/**
 * Pure rules for the Home screen (no database): the practice week, the weekly minutes, the tip of the day and which recent win to
 * celebrate. Days are YYYY-MM-DD keys in Eastern time, the same keys FingerPracticeDay uses.
 */

/** Ten minutes a day, every day of the week. */
export const WEEKLY_GOAL_MINUTES = 70;

function shiftDay(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** The Sunday on or before `today`: the practice week runs Sunday to Saturday. */
export function weekStartKey(today: string): string {
  const [y, m, d] = today.split("-").map(Number);
  return shiftDay(today, -new Date(Date.UTC(y, m - 1, d)).getUTCDay());
}

/** Whole minutes practiced from this week's Sunday through today. */
export function minutesThisWeek(rows: { day: string; seconds: number }[], today: string): number {
  const start = weekStartKey(today);
  const seconds = rows.filter((r) => r.day >= start && r.day <= today).reduce((sum, r) => sum + r.seconds, 0);
  return Math.floor(seconds / 60);
}

/** Which day of the week a day key is, 0 for Sunday. */
export function weekDayIndex(today: string): number {
  const [y, m, d] = today.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Minutes practiced on each day of this week, Sunday first (seven numbers; days still ahead are 0). */
export function weekDayMinutes(rows: { day: string; seconds: number }[], today: string): number[] {
  const start = weekStartKey(today);
  return Array.from({ length: 7 }, (_, i) => {
    const day = shiftDay(start, i);
    if (day > today) return 0;
    return Math.floor(rows.filter((r) => r.day === day).reduce((sum, r) => sum + r.seconds, 0) / 60);
  });
}

export const TIPS: { title: string; body: string }[] = [
  { title: "Slow is fast", body: "Play a scale at half speed until it is clean three times in a row, then speed up a little." },
  { title: "Scale of the day: C major", body: "No black keys at all. Say each note name out loud as you play it, up and back down." },
  { title: "Thumb under, quietly", body: "In a piano scale the thumb tucks under the hand. Keep the wrist level so the line stays smooth." },
  { title: "Use the metronome", body: "Set it to 60 and play one note per click. When that is easy, play two notes per click." },
  { title: "Scale of the day: A minor", body: "The same notes as C major, starting on A. Listen for how the mood changes." },
  { title: "Short and daily wins", body: "Ten focused minutes every day beat one long session a week. Your fingers remember the habit." },
  { title: "Listen first", body: "Before you play a scale, hum the first five notes. Your ear will guide your fingers." },
  { title: "Scale of the day: Tizita", body: "A pentatonic Ethiopian scale full of longing. Play it slowly and let each note ring." },
  { title: "Relax your shoulders", body: "Tension travels down to your fingers. Drop your shoulders and breathe out before you start." },
  { title: "Hands separately", body: "Learn each hand alone before putting them together. It is quicker in the end." },
  { title: "Scale of the day: G major", body: "One sharp: F sharp. Find it before you start so it never surprises you." },
  { title: "Record yourself", body: "A one minute phone recording shows you what you cannot hear while playing." },
  { title: "End on a win", body: "Finish practice with something you play well. You will want to come back tomorrow." },
  { title: "Scale of the day: Bati", body: "Bright and proud. Compare it with Tizita: one note changes the whole feeling." },
];

/** The same tip all day, a different one each day, cycling through the list. */
export function tipOfTheDay(today: string): { title: string; body: string } {
  const [y, m, d] = today.split("-").map(Number);
  const dayNumber = Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
  return TIPS[dayNumber % TIPS.length];
}

/** Something worth a small celebration: a new badge, a scale the teacher opened, or a streak goal reached. */
export interface Win {
  kind: "badge" | "scale" | "streak";
  /** Unique per win, so each one is celebrated once. */
  key: string;
  title: string;
  detail: string;
  at: Date;
}

/** The newest win from the last `maxAgeDays` days, or null. */
export function pickCelebration(wins: Win[], now: Date, maxAgeDays = 7): Win | null {
  const cutoff = now.getTime() - maxAgeDays * 86_400_000;
  return wins.filter((w) => w.at.getTime() >= cutoff).sort((a, b) => b.at.getTime() - a.at.getTime())[0] ?? null;
}

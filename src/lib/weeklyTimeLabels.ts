// How a weekly class time reads on screen. Pure, shared by the plan form and anything else that shows a time.

/** "14:00" -> "2:00 PM". */
export function formatTimeLabel(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}

/** Start time plus the class length, e.g. "6:00 PM to 6:45 PM". */
export function formatTimeRange(startHHmm: string, minutes: number): string {
  const [h, m] = startHHmm.split(":").map(Number);
  const total = h * 60 + m + minutes;
  return `${formatTimeLabel(startHHmm)} to ${formatTimeLabel(`${Math.floor(total / 60) % 24}:${String(total % 60).padStart(2, "0")}`)}`;
}

export const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
/** Monday first: how people think of a school week. */
export const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

// The fixed wording and limits of a friend's nudge to practice. Pure, so it is unit tested. Nothing a person types ever goes into a nudge.

export const NUDGES_PER_FRIEND_PER_DAY = 2;
export const NUDGES_PER_DAY_IN_ALL = 20;

/** The first word of a name, or the username, or "A friend". */
export function nudgeSenderLabel(name: string | null | undefined): string {
  const first = name?.trim().split(/\s+/)[0];
  return first && first.length > 0 ? first.slice(0, 30) : "A friend";
}

export function nudgeTitle(name: string | null | undefined): string {
  return `Your friend ${nudgeSenderLabel(name)} is reminding you to practice`;
}

export function nudgeBody(): string {
  return "Tap to start your 10 minutes.";
}

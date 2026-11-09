// Whether to play the homepage background video. It is a 17 MB file, so people on a slow
// connection, with data saver on, or who ask for less motion get it paused on its first frame instead.
// Pure, so it is tested.

export interface HeroVideoSignals {
  reducedMotion: boolean;
  saveData: boolean;
  /** navigator.connection.effectiveType, when the browser reports one. */
  effectiveType: string | null;
}

export function heroVideoAllowed(s: HeroVideoSignals): boolean {
  if (s.reducedMotion || s.saveData) return false;
  const t = s.effectiveType?.toLowerCase() ?? "";
  return !(t === "slow-2g" || t === "2g" || t === "3g");
}

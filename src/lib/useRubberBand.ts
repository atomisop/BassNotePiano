/**
 * Resistance past a limit (revamp rule 19): the further you pull beyond the edge, the less the content follows, like iOS. Pure math so
 * drags can drive a ref directly with no React state per move (rule 14: never tween while the finger is down; only animate the
 * release, back to the limit).
 *
 *   rubberBand(offset, min, max, dimension)
 *     inside [min, max]: returns offset unchanged
 *     outside: returns the limit plus a damped overshoot that never exceeds `dimension`
 */
export function rubberBand(offset: number, min: number, max: number, dimension = 300, constant = 0.55): number {
  if (offset >= min && offset <= max) return offset;
  const over = offset < min ? min - offset : offset - max;
  const damped = (1 - 1 / ((over * constant) / dimension + 1)) * dimension;
  return offset < min ? min - damped : max + damped;
}

/** Hook form: a stable function bound to one set of limits. */
import { useCallback } from "react";
export function useRubberBand(min: number, max: number, dimension = 300) {
  return useCallback((offset: number) => rubberBand(offset, min, max, dimension), [min, max, dimension]);
}

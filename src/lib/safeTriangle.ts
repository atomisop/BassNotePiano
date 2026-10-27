/**
 * The "safe triangle" for hover menus (the trick Amazon's category menu is known for). When the pointer leaves a menu row to reach the
 * flyout beside it, it rarely travels in a straight horizontal line, and crossing the rows below would swap the flyout for another one.
 * The triangle runs from the point where the pointer left to the two nearest corners of the flyout; a pointer still inside it is
 * heading for the flyout, so the current one stays open.
 */
export interface Point {
  x: number;
  y: number;
}

const sign = (p: Point, a: Point, b: Point) => (p.x - b.x) * (a.y - b.y) - (a.x - b.x) * (p.y - b.y);

/** True when `p` is inside (or on the edge of) the triangle a, b, c. */
export function pointInTriangle(p: Point, a: Point, b: Point, c: Point): boolean {
  const d1 = sign(p, a, b);
  const d2 = sign(p, b, c);
  const d3 = sign(p, c, a);
  const hasNegative = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPositive = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNegative && hasPositive);
}

/** The triangle for a flyout on the RIGHT of its row: from where the pointer left, to the flyout's top-left and bottom-left corners. */
export function safeTriangleFor(leftAt: Point, flyout: { left: number; top: number; bottom: number }): [Point, Point, Point] {
  return [leftAt, { x: flyout.left, y: flyout.top }, { x: flyout.left, y: flyout.bottom }];
}

export function isHeadingForFlyout(pointer: Point, leftAt: Point, flyout: { left: number; top: number; bottom: number }): boolean {
  const [a, b, c] = safeTriangleFor(leftAt, flyout);
  return pointInTriangle(pointer, a, b, c);
}

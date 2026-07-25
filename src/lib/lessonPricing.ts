// Split out from lessons.ts on purpose — that module pulls in Prisma and
// the notifications lib, which must never end up in a "use client" bundle
// (the /billing/lessons quantity+type picker needs this pure math client-side).

export const LESSON_PRICE_CENTS = 5000; // $50 per 30-minute lesson, full price for a single session
export const LESSON_DISCOUNT_RATE = 0.2; // 20% off the whole order once bundled
export const BUNDLE_MIN_QUANTITY = 2; // 2+ sessions qualifies as a bundle — Online and In-Person both follow this same rule

export interface LessonTotal {
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
}

/**
 * Not just a single total — the admin queue needs to *show* the discount
 * applied, so this returns the breakdown and both the queue and the
 * purchase page recompute it from lessonQuantity at render time rather
 * than trusting a stored value that could drift. Type (Online/In-Person)
 * doesn't affect price — only which credit pool gets spent — so it isn't
 * a parameter here. A single session (quantity 1) stays full price; the
 * discount only kicks in once you bundle 2 or more.
 */
export function calculateLessonTotal(quantity: number): LessonTotal {
  const subtotalCents = quantity * LESSON_PRICE_CENTS;
  const discountCents = quantity >= BUNDLE_MIN_QUANTITY ? Math.round(subtotalCents * LESSON_DISCOUNT_RATE) : 0;
  return { subtotalCents, discountCents, totalCents: subtotalCents - discountCents };
}

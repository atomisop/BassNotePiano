import type { LessonType } from "@prisma/client";

// Split out from lessons.ts on purpose — that module pulls in Prisma and
// the notifications lib, which must never end up in a "use client" bundle
// (the /billing/lessons quantity+type picker needs this pure math client-side).

export const LESSON_PRICE_CENTS = 5000; // $50 per 30-minute lesson
export const IN_PERSON_DISCOUNT_RATE = 0.2; // 20% off the lesson portion for In-Person, any quantity

export interface LessonTotal {
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
}

/**
 * Not just a single total — the admin queue needs to *show* the discount
 * applied, so this returns the breakdown and both the queue and the
 * purchase page recompute it from lessonQuantity/lessonType at render time
 * rather than trusting a stored value that could drift.
 */
export function calculateLessonTotal(quantity: number, type: LessonType): LessonTotal {
  const subtotalCents = quantity * LESSON_PRICE_CENTS;
  const discountCents = type === "IN_PERSON" ? Math.round(subtotalCents * IN_PERSON_DISCOUNT_RATE) : 0;
  return { subtotalCents, discountCents, totalCents: subtotalCents - discountCents };
}

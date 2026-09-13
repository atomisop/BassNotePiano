import { redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/auth";
import { getEffectiveClassCredits, getUpcomingOccurrences, getUserClassBookings, getWeeklyCreditUsage } from "@/lib/classSchedule";
import { getSupportContactId } from "@/lib/admin";
import { EXTRA_SESSION_FLAT_PRICE_CENTS } from "@/lib/classCreditPricing";
import { ScheduleClient } from "./ScheduleClient";

/**
 * "My week," at a glance: how much of a student's own weekly commitment
 * they've used, their own upcoming classes, and other open times if they
 * want an extra session. Picking one of those times and paying
 * EXTRA_SESSION_FLAT_PRICE_CENTS is the whole purchase, once the payment
 * verifies, the exact slot they picked is booked automatically
 * (bookExtraSessionOccurrence in classSchedule.ts, called from
 * approveZellePayment), nothing left to go do at /lessons afterward.
 * That's also the only door left open for "more than my plan gives me": a
 * student with an active Payment Plan can no longer self-book an ad hoc
 * class there either (bookClass blocks it), by direct instruction, since a
 * spendable balance a subscriber can use however and whenever they want is
 * exactly the "buy credits, then go schedule it all yourself" friction and
 * same-day-binge risk this page exists to remove.
 *
 * No self-service reschedule action anywhere on this page, by direct
 * instruction: a Payment Plan's reserved weekly day/time is locked in at
 * enrollment (see createPaymentPlan in paymentPlans.ts) and nothing in this
 * app lets a student change it themselves after that. ScheduleClient says
 * so plainly next to "your classes" rather than leaving that gap to look
 * like a missing feature.
 */
export default async function SchedulePage() {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login?callbackUrl=/schedule");
  // Same gate every other credits-adjacent page uses: booking (and now
  // topping up) requires curriculum access first.
  if (!session.user.hasCurriculumAccess) redirect("/billing/curriculum?next=schedule");

  const [credits, weeklyUsage, occurrences, bookings, supportContactId] = await Promise.all([
    getEffectiveClassCredits(session.user.id),
    getWeeklyCreditUsage(session.user.id),
    getUpcomingOccurrences(),
    getUserClassBookings(session.user.id),
    getSupportContactId(),
  ]);

  const now = Date.now();
  const upcomingBookings = bookings
    .filter((b) => b.status === "SCHEDULED" && b.scheduledAt.getTime() > now)
    .sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());

  // Soonest few open (not-yet-booked), single-credit occurrences only, a
  // teaser, not the full rolling-window calendar /lessons already shows in
  // full. Single-credit only: EXTRA_SESSION_FLAT_PRICE_CENTS is a flat rate
  // for exactly one 30-min session, so a 2-credit chunk is left out here
  // rather than shown as something this button can't actually buy.
  const openSlots = occurrences.filter((o) => !o.isBooked && o.creditCost === 1).slice(0, 6);

  return (
    <ScheduleClient
      zelleHandle={process.env.ZELLE_HANDLE ?? "payments@yourplatform.com"}
      credits={credits}
      creditsUsedThisWeek={weeklyUsage.creditsUsedThisWeek}
      weeklyAllotment={weeklyUsage.weeklyAllotment}
      supportContactId={supportContactId}
      extraSessionPriceCents={EXTRA_SESSION_FLAT_PRICE_CENTS}
      upcomingBookings={upcomingBookings.map((b) => ({
        id: b.id,
        label: b.schedule.label,
        scheduledAt: b.scheduledAt.toISOString(),
        creditsSpent: b.creditsSpent,
      }))}
      openSlots={openSlots.map((o) => ({
        scheduleId: o.scheduleId,
        occurrenceDateMs: o.occurrenceDate.getTime(),
        chunkIndex: o.chunkIndex,
        label: o.label,
        scheduledAt: o.scheduledAt.toISOString(),
      }))}
    />
  );
}

import { discordLinkState } from "@/lib/discordLinkState";
import { ParentLockedArea } from "@/components/parent/ParentLockedArea";
import { hasParentControl } from "@/lib/parentLinks";
import { getMyBookingRequests, getRequestHints, isRequestMode } from "@/lib/bookingRequests";
import { redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  getEffectiveClassCredits,
  hasLivePaymentPlan,
  getUpcomingOccurrences,
  getUserClassBookings,
  getWeeklyCreditUsage,
  chunksForSchedule,
  CANCELLATION_CUTOFF_HOURS,
  SOLO_MAX_CREDITS,
  FAMILY_MIN_ATTENDEES,
  FAMILY_CREDITS_PER_STUDENT,
} from "@/lib/classSchedule";
import { getActivePaymentPlan, getFifthClassOffer } from "@/lib/paymentPlans";
import { ClassBookingClient } from "./ClassBookingClient";
import { ScheduleClient } from "./ScheduleClient";
import { getBoolSetting, getNumberSetting } from "@/lib/siteSettings";
import { LessonsHub } from "./LessonsHub";
import { addMinutesToHHmm } from "@/lib/classScheduleLabels";
import { discordChannelUrl } from "@/lib/discord";
import { getPricingConfig } from "@/lib/pricing";
import { MyPlanSummary } from "@/components/billing/MyPlanSummary";
import { DiscordConnectCard } from "@/components/lessons/DiscordConnectCard";

/**
 * A student on an active Payment Plan sees two tabs here. "My weekly class" is
 * their locked-in time: it is paid by the plan and auto-booked, so there is
 * nothing to buy or book, only a way to move or cancel a single class up to 24
 * hours ahead. "Extra sessions" is the booking calendar, for extra time with the
 * teacher on top of that, paid with credits at $55 each. Everyone else (no
 * active plan, between plans) goes straight to the booking calendar.
 */
export const metadata = { title: "Online lessons" };

export default async function LessonsPage(props: { searchParams: Promise<{ tab?: string; discord?: string }> }) {
  const searchParams = await props.searchParams;
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login?callbackUrl=/lessons");
  // Booking a class requires curriculum access first, credits themselves
  // already can't be bought without it (see billing/lessons/page.tsx), but
  // this covers anyone who somehow already holds credits without it too.

  const activePlan = await getActivePaymentPlan(session.user.id);
  const [cancelCutoffHours, canCancel, canReschedule] = await Promise.all([
    getNumberSetting("cancel.cutoffHours"),
    getBoolSetting("cancel.studentCanCancel"),
    getBoolSetting("cancel.studentCanReschedule"),
  ]);

  const [credits, occurrences, bookings, weeklyLimited, pricing, requestMode, myRequests, requestHints] = await Promise.all([
    // Effective, not raw: a credit already reserved by another SCHEDULED
    // booking isn't actually free to spend again, even though the real
    // charge for it hasn't landed yet, see getEffectiveClassCredits.
    getEffectiveClassCredits(session.user.id),
    getUpcomingOccurrences(session.user.id),
    getUserClassBookings(session.user.id),
    hasLivePaymentPlan(session.user.id),
    getPricingConfig(),
    isRequestMode(),
    getMyBookingRequests(session.user.id),
    getRequestHints(session.user.id),
  ]);

  // A Monthly subscriber whose billing month holds a fifth class day can add it for a set price.
  const fifthOffer = activePlan ? await getFifthClassOffer(session.user.id) : null;

  const bookingClient = (
    <ClassBookingClient
      extraClassCents={pricing.extraClassCents}
      fifthClassOffer={fifthOffer ? { scheduledAt: fifthOffer.scheduledAt.toISOString(), priceCents: fifthOffer.priceCents } : null}
      requestMode={requestMode}
      myRequests={myRequests.map((r) => ({ id: r.id, label: r.label, scheduledAt: r.scheduledAt.toISOString(), status: r.status, ahead: r.ahead }))}
      requestHints={requestHints}
      extraMode={Boolean(activePlan)}
      weeklyLimited={weeklyLimited}
      initialCredits={credits}
      zelleHandle={process.env.ZELLE_HANDLE ?? "payments@yourplatform.com"}
      cancellationCutoffHours={cancelCutoffHours}
      canCancel={canCancel}
      canReschedule={canReschedule}
      soloMaxCredits={SOLO_MAX_CREDITS}
      familyMinAttendees={FAMILY_MIN_ATTENDEES}
      familyCreditsPerStudent={FAMILY_CREDITS_PER_STUDENT}
      occurrences={occurrences.map((o) => ({
        scheduleId: o.scheduleId,
        label: o.label,
        dayOfWeek: o.dayOfWeek,
        chunkIndex: o.chunkIndex,
        durationMin: o.durationMin,
        creditCost: o.creditCost,
        occurrenceDateMs: o.occurrenceDate.getTime(),
        scheduledAt: o.scheduledAt.toISOString(),
        isBooked: o.isBooked,
        reservedForYou: o.reservedForYou,
        heldByPlan: o.reservedByPlan === true,
      }))}
      initialBookings={bookings.map((b) => ({
        id: b.id,
        label: b.schedule.label,
        occurrenceDateMs: b.occurrenceDate.getTime(),
        scheduledAt: b.scheduledAt.toISOString(),
        creditsSpent: b.creditsSpent,
        status: b.status,
        refunded: b.refunded,
        attendance: b.attendance,
        canceledReason: b.canceledReason,
        reserved: Boolean(b.reservedByPlanId),
        inPerson: b.inPerson,
        discordUrl: b.discordChannelId ? discordChannelUrl(b.discordChannelId) : null,
      }))}
    />
  );

  const me = await prisma.user.findUnique({ where: { id: session.user.id }, select: { discordId: true, discordUsername: true } });
  const card = <DiscordConnectCard link={discordLinkState({ discordId: me?.discordId ?? null, discordUsername: me?.discordUsername ?? null })} flag={searchParams.discord} />;

  // One title at the top of Lessons, pinned like every page's heading, above the Discord card and the plan (it used to sit halfway down).
  // Not wrapped in a layout box: a pinned heading only stays pinned while its parent is the whole page.
  const heading = (
    <div data-deck-header className="deck-header mx-auto -mt-4 mb-4 w-full max-w-wide pt-4">
      <h1 className="font-hero text-hero font-bold text-balance text-slate-50">Lessons</h1>
    </div>
  );

  const parentControlled = await hasParentControl(session.user.id);
  if (!activePlan)
    return (
      <>
        {heading}
        {card}
        <ParentLockedArea locked={parentControlled}>{bookingClient}</ParentLockedArea>
      </>
    );

  const [weeklyUsage, reservedSchedule] = await Promise.all([
    getWeeklyCreditUsage(session.user.id),
    activePlan.reservedScheduleId
      ? prisma.classSchedule.findUnique({ where: { id: activePlan.reservedScheduleId }, select: { dayOfWeek: true, startTime: true, durationMin: true } })
      : null,
  ]);

  const now = Date.now();
  const upcomingBookings = bookings
    .filter((b) => b.status === "SCHEDULED" && b.scheduledAt.getTime() > now)
    .sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());

  return (
    <>
      {heading}
      {card}
      <MyPlanSummary userId={session.user.id} />
    <ParentLockedArea locked={parentControlled}>
    <LessonsHub
      initialTab={searchParams.tab === "extra" ? "extra" : "weekly"}
      weekly={
        <ScheduleClient
          cancellationCutoffHours={cancelCutoffHours}
          canCancel={canCancel}
          canReschedule={canReschedule}
          hasClassThisWeek={weeklyUsage.creditsUsedThisWeek > 0}
          weeklyTime={
            reservedSchedule
              ? {
                  dayOfWeek: reservedSchedule.dayOfWeek,
                  // The plan's own piece of the window, not the window's start.
                  startTime: addMinutesToHHmm(
                    reservedSchedule.startTime,
                    chunksForSchedule(reservedSchedule)[activePlan.reservedChunkIndex ?? 0]?.offsetMin ?? 0,
                  ),
                }
              : null
          }
          upcomingBookings={upcomingBookings.map((b) => ({
            id: b.id,
            label: b.schedule.label,
            scheduledAt: b.scheduledAt.toISOString(),
            creditsSpent: b.creditsSpent,
            inPerson: b.inPerson,
            discordUrl: b.discordChannelId ? discordChannelUrl(b.discordChannelId) : null,
          }))}
        />
      }
      extras={bookingClient}
    />
    </ParentLockedArea>
    </>
  );
}

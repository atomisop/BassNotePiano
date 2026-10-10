import { prisma } from "@/lib/prisma";
import { removeFromGuild } from "@/lib/discordApi";

export interface BanOutcome {
  alreadyBanned: boolean;
  plansCanceled: number;
  classesCanceled: number;
  openBillsClosed: number;
  /** Payments the person says they sent that still need a human to look at. Left alone on purpose. */
  paymentsLeftForReview: number;
  discord: "removed" | "not_connected" | "not_in_server" | "failed";
}

/**
 * A ban is a termination: besides blocking sign-in and ending every open session, it ends everything the account had
 * running. Active payment plans are canceled (quietly: the person is not emailed), every class still booked is canceled
 * (so no Discord call opens for them), unpaid bills are closed, complimentary access and the trial end, and they are removed
 * from the Discord server. Money already paid is never touched, and a payment waiting for review is left for the owner to
 * decide, because it may be real money. Credits stay on the record. Lifting the ban lets them sign in again but does not
 * bring any of this back.
 */
export async function banAccount(input: { userId: string; adminId: string; reason: string }): Promise<BanOutcome> {
  const { userId, adminId, reason } = input;
  const now = new Date();

  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { bannedAt: true, discordId: true } });
    if (user.bannedAt) return { alreadyBanned: true as const };

    await tx.user.update({
      where: { id: userId },
      data: {
        bannedAt: now,
        bannedReason: reason || null,
        sessionVersion: { increment: 1 },
        hasCurriculumAccess: false,
        trialEndsAt: null,
        discordId: null,
        discordUsername: null,
      },
    });

    const plans = await tx.paymentPlan.updateMany({
      where: { userId, status: "ACTIVE" },
      data: { status: "CANCELED", canceledAt: now, canceledById: adminId, cancellationNote: "Account banned" },
    });
    const classes = await tx.classBooking.updateMany({
      where: { studentId: userId, status: "SCHEDULED" },
      // A reason is always set, so the weekly-slot job never books one of these again.
      data: { status: "CANCELED", refunded: true, canceledReason: "Account banned" },
    });
    const bills = await tx.zellePayment.updateMany({ where: { userId, status: "AWAITING_TRANSFER" }, data: { status: "EXPIRED" } });
    const waiting = await tx.zellePayment.count({ where: { userId, status: "PENDING_REVIEW" } });

    return { alreadyBanned: false as const, discordId: user.discordId, plans: plans.count, classes: classes.count, bills: bills.count, waiting };
  });

  if (result.alreadyBanned) {
    return { alreadyBanned: true, plansCanceled: 0, classesCanceled: 0, openBillsClosed: 0, paymentsLeftForReview: 0, discord: "not_connected" };
  }

  // Outside the transaction: a slow or failing Discord call must not undo the ban.
  let discord: BanOutcome["discord"] = "not_connected";
  if (result.discordId) {
    try {
      const r = await removeFromGuild(result.discordId);
      discord = r === "removed" ? "removed" : r === "not_member" ? "not_in_server" : "failed";
    } catch {
      discord = "failed";
    }
  }

  return {
    alreadyBanned: false,
    plansCanceled: result.plans,
    classesCanceled: result.classes,
    openBillsClosed: result.bills,
    paymentsLeftForReview: result.waiting,
    discord,
  };
}

/** One readable line for the owner and the audit log. */
export function describeBan(o: BanOutcome): string {
  const parts = [
    `${o.plansCanceled} plan${o.plansCanceled === 1 ? "" : "s"} canceled`,
    `${o.classesCanceled} class${o.classesCanceled === 1 ? "" : "es"} canceled`,
    ...(o.openBillsClosed ? [`${o.openBillsClosed} unpaid bill${o.openBillsClosed === 1 ? "" : "s"} closed`] : []),
    o.discord === "removed" ? "removed from Discord" : o.discord === "failed" ? "could not be removed from Discord (do it by hand)" : o.discord === "not_in_server" ? "was not in the Discord server" : "had no Discord connected",
  ];
  const line = parts.join(", ");
  return o.paymentsLeftForReview ? `${line}. ${o.paymentsLeftForReview} payment${o.paymentsLeftForReview === 1 ? " is" : "s are"} still waiting for your review.` : `${line}.`;
}

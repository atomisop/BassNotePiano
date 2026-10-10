import { prisma } from "@/lib/prisma";
import { createNotification } from "@/lib/notifications";
import { formatEtDateTime } from "@/lib/classScheduleLabels";
import { creditsLabelFromStored } from "@/lib/classCreditPricing";

// Notices a student should get and used not to: a booking made for them, what their attendance mark cost, a payment
// received, a trial ending, a plan change, and changes to their account. Each one is an in-app notice and an email (the
// category they can switch off, except account changes, which always email: they are security confirmations). None of
// them can ever fail the action that triggers them.

async function safely(what: string, work: () => Promise<unknown>): Promise<void> {
  try {
    await work();
  } catch (err) {
    console.error(`${what} notice failed (non-blocking):`, err);
  }
}

/** A class was booked for the student: by themselves, as part of a family booking, or by the studio. */
export function noticeBookingConfirmed(input: { studentId: string; scheduledAt: Date; label: string | null; storedCredits: number; byStudio?: boolean }): Promise<void> {
  return safely("Booking confirmation", () =>
    createNotification({
      userId: input.studentId,
      type: "LESSON_BOOKING_CONFIRMED",
      title: input.byStudio ? "The studio booked a class for you" : "Class booked",
      body: `${input.label ?? "Your class"} on ${formatEtDateTime(input.scheduledAt)} (US Eastern) is booked. It uses ${creditsLabelFromStored(input.storedCredits)} when it takes place.`,
      emailCategory: "social",
    }),
  );
}

/** A class was marked present or no-show. */
export function noticeAttendanceRecorded(input: { studentId: string; present: boolean; scheduledAt: Date; storedCredits: number }): Promise<void> {
  return safely("Attendance", () =>
    createNotification({
      userId: input.studentId,
      type: "ATTENDANCE_RECORDED",
      title: input.present ? "Class complete" : "Class missed",
      body: input.present
        ? `Your ${formatEtDateTime(input.scheduledAt)} class is complete. ${creditsLabelFromStored(input.storedCredits)} used.`
        : `You did not attend your ${formatEtDateTime(input.scheduledAt)} class. ${creditsLabelFromStored(input.storedCredits)} used, as for any booked class.`,
      emailCategory: input.present ? undefined : "social",
    }),
  );
}

/** A payment was submitted and now waits for review (not one that cleared by itself). */
export function noticePaymentReceived(input: { userId: string; amountCents: number }): Promise<void> {
  const amount = (input.amountCents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
  return safely("Payment received", () =>
    createNotification({
      userId: input.userId,
      type: "PAYMENT_RECEIVED",
      title: "We received your payment",
      body: `Your ${amount} payment is waiting to be confirmed. This usually takes until the same day. You will get another notice when it is approved.`,
      emailCategory: "payments",
    }),
  );
}

/** The free trial ends within a day, or has just ended. */
export function noticeTrial(input: { userId: string; ended: boolean }): Promise<void> {
  return safely("Trial", () =>
    createNotification({
      userId: input.userId,
      type: "TRIAL_ENDING",
      title: input.ended ? "Your free trial has ended" : "Your free trial ends tomorrow",
      body: input.ended ? "Pick a class plan to keep learning with your teacher and unlock every lesson." : "Pick a class plan before it ends to keep learning with your teacher and unlock every lesson.",
      emailCategory: "payments",
    }),
  );
}

/** A plan started, or its term changed. */
export function noticePlanUpdated(input: { userId: string; title: string; body: string }): Promise<void> {
  return safely("Plan update", () => createNotification({ userId: input.userId, type: "PAYMENT_PLAN_UPDATED", title: input.title, body: input.body, emailCategory: "payments" }));
}

type AccountChange =
  | { kind: "discord-connected"; name: string }
  | { kind: "discord-disconnected"; by: "you" | "admin" }
  | { kind: "phone-cleared" }
  | { kind: "signed-out-everywhere"; by: "you" | "admin" };

/** Confirms a change to the account. Always emailed (a confirmation of a security-relevant change), whatever their preferences. */
export function noticeAccountChange(userId: string, change: AccountChange): Promise<void> {
  const text = (() => {
    switch (change.kind) {
      case "discord-connected":
        return { title: "Discord connected", body: `Your Discord account ${change.name} is connected. Your private class call opens there a few minutes before each class. If this was not you, disconnect it in Settings.` };
      case "discord-disconnected":
        return {
          title: "Discord disconnected",
          body: change.by === "you" ? "You disconnected Discord. You will not be added to your class calls until you connect it again in Settings or on the Lessons page." : "The studio disconnected your Discord. You will not be added to your class calls until you connect it again on the Lessons page.",
        };
      case "phone-cleared":
        return { title: "Your phone number was removed", body: "The studio removed the phone number from your account. You can add your own number again in Settings." };
      case "signed-out-everywhere":
        return { title: "You were signed out of your devices", body: change.by === "you" ? "You signed out of your other devices. Anyone using them must sign in again." : "The studio signed you out of all your devices. Sign in again to continue. If this is unexpected, change your password." };
    }
  })();
  return safely("Account change", () => createNotification({ userId, type: "ACCOUNT_UPDATE", title: text.title, body: text.body, emailCategory: "roleUpdates", alwaysEmail: true }));
}

/** Once per marker: used so a daily job never repeats a notice. Returns true the first time. */
export async function claimNoticeMarker(key: string): Promise<boolean> {
  try {
    await prisma.appSetting.create({ data: { key, value: String(Date.now()) } });
    return true;
  } catch (err) {
    if ((err as { code?: string })?.code === "P2002") return false;
    throw err;
  }
}

// What to tell someone who has paid and is waiting for it to clear. Pure, so it is tested.

/** After this long the notice stops saying "a few minutes" and says a person is looking at it. */
export const SLOW_PAYMENT_MINUTES = 30;

export interface PaymentWaitNotice {
  headline: string;
  detail: string;
  /** Past the usual time: offer the message-us button more prominently. */
  slow: boolean;
}

function ago(minutes: number): string {
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  return `${Math.floor(hours / 24)} days ago`;
}

export function describePaymentWait(submittedAt: Date | null, now: Date = new Date()): PaymentWaitNotice {
  const minutes = submittedAt ? Math.max(0, Math.floor((now.getTime() - submittedAt.getTime()) / 60_000)) : 0;
  const submitted = submittedAt ? `Submitted ${ago(minutes)}. ` : "";
  if (minutes < SLOW_PAYMENT_MINUTES) {
    return {
      headline: "Your payment is in. We're verifying it now.",
      detail: `${submitted}Most payments clear within a few minutes of the bank's email reaching us. We'll email you and send a notification the moment it does, so you can close this page.`,
      slow: false,
    };
  }
  return {
    headline: "This is taking longer than usual.",
    detail: `${submitted}A person is checking it by hand. You do not need to pay again, and we'll email you the moment it clears. If you'd like an answer sooner, message us about it.`,
    slow: true,
  };
}

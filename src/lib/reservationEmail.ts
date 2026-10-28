/** "10:00 AM", "10:00 AM and 11:00 AM", "10:00 AM, 11:00 AM and 12:00 PM". */
export function joinTimes(times: string[]): string {
  if (times.length <= 1) return times.join("");
  return `${times.slice(0, -1).join(", ")} and ${times[times.length - 1]}`;
}

/**
 * The email that tells a customer a time is kept for them. `when` reads like "Saturday, Nov 7 at 10:00 AM" or
 * "Saturday, Nov 7 (the whole day)". It tells them to start a subscription to claim it, and which email address to use,
 * because the time opens only for the account that has that verified address.
 */
export function reservationEmailBody(input: { name: string; when: string; email: string; hasAccount: boolean }): string {
  const first = input.name.trim().split(/\s+/)[0] || "there";
  const how = input.hasAccount
    ? `Sign in with this email address (${input.email}) and pick a plan.`
    : `Make your account with this email address (${input.email}), then pick a plan.`;
  return [
    `Hey ${first},`,
    `The owner reserved a time for you: ${input.when}.`,
    `Start your subscription to claim your reservation. ${how} Until then, nobody else can book that time.`,
  ].join("\n\n");
}

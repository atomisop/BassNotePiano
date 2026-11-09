// Pure wording for the follow-up list (no database), so it is tested on its own.

/** The line shown after "Remind all": how many went and how many were left out. */
export function bulkReminderMessage(r: { sent: unknown[]; skipped: number }): string {
  const sent = r.sent.length;
  const head = sent === 0 ? "No reminders sent." : `Sent ${sent} ${sent === 1 ? "reminder" : "reminders"}.`;
  return r.skipped === 0 ? head : `${head} ${r.skipped} skipped: already reminded today, or it no longer applies.`;
}

/** "Remind all 7" opens with this question. */
export function bulkReminderQuestion(kind: string, total: number, title: string): string {
  const who = total === 1 ? "the 1 person" : `all ${total}`;
  return `Send the "${title}" reminder to ${who}? Anyone already reminded today is skipped.${kind === "overdue" ? " A group's bill goes once, to the person who pays it." : ""}`;
}

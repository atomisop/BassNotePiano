// "Needs you": the Overview's first block. One row per job waiting for the owner, in plain words, each linking to where it is done.
// Pure (no database), so the wording and the order are tested. The counts come from `getAdminNavBadges` and `getFollowUps`.

export interface NeedsYouRow {
  id: string;
  href: string;
  count: number;
  /** "3 payments to approve". */
  text: string;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** The order is the order of urgency: money first, then people writing in, then classes, then reminders to send. */
export function buildNeedsYou(badges: Record<string, number>, followUps: { key: string; total: number; href: string }[]): NeedsYouRow[] {
  const overdue = followUps.find((f) => f.key === "overdue");
  const rows: NeedsYouRow[] = [
    { id: "payments", href: "/admin/payments", count: badges["/admin/payments"] ?? 0, text: "" },
    { id: "overdue", href: overdue?.href ?? "/admin/users", count: overdue?.total ?? 0, text: "" },
    { id: "support", href: "/admin/support", count: badges["/admin/support"] ?? 0, text: "" },
    { id: "unmarked", href: "/admin/schedule?view=ATTENDANCE", count: badges["/admin/schedule"] ?? 0, text: "" },
  ];
  const words: Record<string, (n: number) => string> = {
    payments: (n) => `${plural(n, "payment", "payments")} to approve`,
    overdue: (n) => `${plural(n, "bill", "bills")} overdue`,
    support: (n) => `${plural(n, "chat", "chats")} waiting for a reply`,
    unmarked: (n) => `${plural(n, "class", "classes")} to mark present or no-show`,
  };
  return rows.filter((r) => r.count > 0).map((r) => ({ ...r, text: words[r.id](r.count) }));
}

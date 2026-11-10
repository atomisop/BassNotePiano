// "Needs you": the Overview's first block. One row per job waiting for the studio, in plain words, built from the same list as the
// alerts button (`getAttentionItems` in admin.ts) plus overdue bills from the follow-ups. A row with a few items behind it opens in place
// (`getNeedsYouItems`) with each item's main action. Pure (no database), so the wording and the order are tested.

export type NeedsYouKind =
  | "payments"
  | "unchecked"
  | "unmatched"
  | "pipeline"
  | "overdue"
  | "jobs"
  | "mail"
  | "atom"
  | "support"
  | "requests"
  | "unmarked"
  | "scales";

export interface NeedsYouRow {
  id: NeedsYouKind;
  href: string;
  count: number;
  /** "3 payments to approve". */
  text: string;
  /** The row opens in place with its first few items and their main action. */
  expandable: boolean;
}

/** One thing behind a row: who or what, one gray line, where its full page is, and its main action (if one can be done in place). */
export interface NeedsYouItem {
  key: string;
  title: string;
  detail: string;
  href: string;
  action: { kind: "approvePayment" | "checkPayment" | "mark" | "approveScale" | "confirmRequest" | "remind"; id: string } | null;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

interface Spec {
  href: string;
  words: (n: number, label: string) => string;
  expandable: boolean;
}

/** The order is the order of urgency: money first, then the studio's own systems, then people writing in, then classes and scales. */
const SPECS: [NeedsYouKind, Spec][] = [
  ["payments", { href: "/admin/payments", words: (n) => `${plural(n, "payment", "payments")} to approve`, expandable: true }],
  ["unchecked", { href: "/admin/payments?status=UNCHECKED", words: (n) => `${plural(n, "automatic approval", "automatic approvals")} to check`, expandable: true }],
  ["unmatched", { href: "/admin/payments?tab=emails", words: (n) => `${plural(n, "bank email", "bank emails")} matched no one`, expandable: false }],
  ["pipeline", { href: "/admin/payments", words: () => "No bank emails lately, but payments are waiting", expandable: false }],
  ["overdue", { href: "/admin/payment-plans?status=OVERDUE", words: (n) => `${plural(n, "bill", "bills")} overdue`, expandable: true }],
  ["jobs", { href: "/admin/security#tasks", words: (n) => (n === 1 ? "An automatic task stopped" : `${n} automatic tasks stopped`), expandable: false }],
  ["mail", { href: "/admin/support?source=email", words: () => "Studio email is not arriving", expandable: false }],
  ["atom", { href: "/admin", words: (_n, label) => label, expandable: false }],
  ["support", { href: "/admin/support", words: (n) => `${plural(n, "chat", "chats")} waiting for a reply`, expandable: true }],
  ["requests", { href: "/admin/schedule?view=REQUESTS", words: (n) => `${plural(n, "booking request", "booking requests")} to answer`, expandable: true }],
  ["unmarked", { href: "/admin/today", words: (n) => `${plural(n, "class", "classes")} to mark present or no-show`, expandable: true }],
  ["scales", { href: "/admin/users?filter=approval", words: (n) => `${plural(n, "student", "students")} ready for the next scale`, expandable: true }],
];
const BY_KIND = new Map(SPECS);

/** The fixed facts about one kind of row (its page, whether it opens in place). */
export function needsYouRowSpec(kind: string): Spec | undefined {
  return BY_KIND.get(kind as NeedsYouKind);
}

export function isNeedsYouKind(kind: unknown): kind is NeedsYouKind {
  return typeof kind === "string" && BY_KIND.has(kind as NeedsYouKind);
}

/**
 * The rows, from the alerts list (`{ id, label, count, href }`, see getAttentionItems) and the follow-ups (for overdue bills). An item's
 * own href wins when it has one (the assistant's alert links to its billing page), else the row's fixed page.
 */
export function buildNeedsYou(
  items: { id: string; label: string; count: number; href: string }[],
  followUps: { key: string; total: number; href: string }[],
): NeedsYouRow[] {
  const counts = new Map<string, { count: number; label: string; href: string }>();
  for (const i of items) counts.set(i.id, { count: i.count, label: i.label, href: i.href });
  const overdue = followUps.find((f) => f.key === "overdue");
  if (overdue) counts.set("overdue", { count: overdue.total, label: "", href: "" });
  const rows: NeedsYouRow[] = [];
  for (const [id, spec] of SPECS) {
    const found = counts.get(id);
    if (!found || found.count <= 0) continue;
    // Only the assistant's alert keeps its own link (it can point outside the app, to the billing page); the rest use the fixed page.
    const href = id === "atom" && found.href ? found.href : spec.href;
    rows.push({ id, href, count: found.count, text: spec.words(found.count, found.label), expandable: spec.expandable });
  }
  return rows;
}

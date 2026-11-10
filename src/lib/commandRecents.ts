// Pure helpers for the command menu's "Recent" list and for the links that open a student's page with one job ready.
// Kept apart from the component so the rules are tested without a browser.

export interface RecentCommand {
  href: string;
  label: string;
}

const KEY = "bnp-cmd-recent";
export const MAX_RECENT = 4;

/**
 * The jobs a student page can open straight into (`?do=`): credits, a class, the plan tools, payments, the plan set up (owner),
 * a message, a note, the next scale, their latest support chat, and the Discord steps.
 */
export const PERSON_ACTION_IDS = ["credits", "book", "plan", "payments", "setup", "message", "note", "scale", "support", "discord"] as const;
export type PersonActionId = (typeof PERSON_ACTION_IDS)[number];

export function isPersonActionId(value: string | null | undefined): value is PersonActionId {
  return !!value && (PERSON_ACTION_IDS as readonly string[]).includes(value);
}

export interface PersonAction {
  id: PersonActionId;
  /** "{who}" becomes the person's first name. */
  label: string;
  /** Extra words the command menu matches on. */
  keywords: string;
  /** Offered for every person found, not only when one person is found. */
  everyday?: boolean;
  ownerOnly?: boolean;
}

/** The command menu's "Do for this person" jobs, everyday ones first. */
export const PERSON_ACTIONS: PersonAction[] = [
  { id: "credits", label: "Add credits for {who}", keywords: "grant credit balance", everyday: true },
  { id: "book", label: "Book a class for {who}", keywords: "schedule lesson", everyday: true },
  { id: "message", label: "Message {who}", keywords: "write mail email send", everyday: true },
  { id: "plan", label: "Plan tools for {who}", keywords: "pause weekly time bill date settings cancel upcoming", everyday: true },
  { id: "payments", label: "See payments for {who}", keywords: "money bill receipt refund", everyday: true },
  { id: "setup", label: "Set up plan for {who}", keywords: "start plan weekly time first class scholarship", ownerOnly: true },
  { id: "note", label: "Write a note on {who}", keywords: "notes teacher remember" },
  { id: "scale", label: "Approve next scale for {who}", keywords: "unlock release scale curriculum" },
  { id: "support", label: "Open support chat with {who}", keywords: "help case conversation reply" },
];

/** One person found gets every job; two or three get the everyday ones, so the list stays short. Owner-only jobs need the owner. */
export function personActionsFor(peopleFound: number, isOwner: boolean): PersonAction[] {
  return PERSON_ACTIONS.filter((a) => (isOwner || !a.ownerOnly) && (peopleFound <= 1 || a.everyday));
}

export function personActionLabel(action: PersonAction, who: string): string {
  return action.label.replace("{who}", who);
}

/** A weekly time handed to Set up plan: `?slot=<scheduleId>:<chunkIndex>`. */
export interface PlanSetupSlot {
  scheduleId: string;
  chunkIndex: number;
}

/** Reads `?slot=<scheduleId>:<chunkIndex>`; anything else (missing, a bad index, odd characters) is no slot. */
export function parseSlotParam(raw: string | null | undefined): PlanSetupSlot | null {
  if (!raw) return null;
  const at = raw.lastIndexOf(":");
  if (at <= 0) return null;
  const scheduleId = raw.slice(0, at);
  const chunk = raw.slice(at + 1);
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(scheduleId) || !/^\d{1,3}$/.test(chunk)) return null;
  return { scheduleId, chunkIndex: Number(chunk) };
}

/** The link that opens a student's page with one job ready. Set up plan can also carry a weekly time. */
export function personActionHref(userId: string, action: PersonActionId, options: { slot?: PlanSetupSlot } = {}): string {
  const slot = action === "setup" && options.slot ? `&slot=${encodeURIComponent(options.slot.scheduleId)}:${options.slot.chunkIndex}` : "";
  return `/admin/users/${userId}?do=${action}${slot}`;
}

/** The longest list Inbox > Messages takes in one go (the same limit the send action keeps). */
export const MAX_MESSAGE_RECIPIENTS = 50;

/** `/admin/messages?to=a,b`: the composer opens with these people filled in. Repeats are dropped and the list is capped. */
export function messageComposeHref(userIds: string[]): string {
  const ids = [...new Set(userIds.filter(Boolean))].slice(0, MAX_MESSAGE_RECIPIENTS);
  return ids.length ? `/admin/messages?to=${ids.map(encodeURIComponent).join(",")}` : "/admin/messages";
}

/** Reads `?to=` back into account ids: only id-shaped values, no repeats, at most MAX_MESSAGE_RECIPIENTS. */
export function parseMessageRecipients(raw: string | string[] | null | undefined): string[] {
  const joined = Array.isArray(raw) ? raw.join(",") : (raw ?? "");
  const ids = joined
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^[A-Za-z0-9_-]{1,64}$/.test(s));
  return [...new Set(ids)].slice(0, MAX_MESSAGE_RECIPIENTS);
}

/** Newest first, no repeats of the same link, never more than MAX_RECENT. */
export function pushRecent(list: RecentCommand[], next: RecentCommand): RecentCommand[] {
  return [next, ...list.filter((r) => r.href !== next.href)].slice(0, MAX_RECENT);
}

export function readRecentCommands(): RecentCommand[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    if (!Array.isArray(raw)) return [];
    return raw.filter((r): r is RecentCommand => typeof r?.href === "string" && typeof r?.label === "string").slice(0, MAX_RECENT);
  } catch {
    return [];
  }
}

export function rememberCommand(next: RecentCommand): RecentCommand[] {
  const list = pushRecent(readRecentCommands(), next);
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {}
  return list;
}

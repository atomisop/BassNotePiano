// Atom — the "ask me anything" widget floating on every page (see
// AssistantWidget.tsx). This file is the only place that talks to the
// Gemini API (via a Google AI Studio key), builds the grounding context,
// and enforces the rate limit.
//
// The system prompt is assembled from the same constants the rest of the
// app renders prices/curriculum from (CURRICULUM_PRICE_CENTS, SCALE_GROUPS,
// classCreditPricing) rather than hand-typed numbers, so it can't drift out
// of sync with what a visitor actually sees on /pricing.

import { GoogleGenAI } from "@google/genai";
import type { PaymentPlanCadence, PaymentPlanTerm } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { assertRateLimit, RateLimitError } from "@/lib/rateLimit";
import { SCALE_GROUPS } from "@/lib/curriculum";
import {
  FAMILY_BUNDLE_DISCOUNT_RATE,
  MIN_FAMILY_BUNDLE_RECIPIENTS,
  EXTRA_SESSION_FLAT_PRICE_CENTS,
  calculateFamilyBundleTotal,
  calculatePaymentPlanRate,
  describePaymentPlan,
} from "@/lib/classCreditPricing";
import { TERMS_LAST_UPDATED } from "@/components/legal/TermsContent";
import { PRIVACY_LAST_UPDATED } from "@/components/legal/PrivacyContent";

export { RateLimitError };

const MODEL = "gemini-3.6-flash";
const MAX_OUTPUT_TOKENS = 800;

/** Cheap, callable before doing any real work — lets the widget show a clear "not set up" reply instead of a raw API failure. */
export function isAssistantConfigured(): boolean {
  return Boolean(process.env.GOOGLE_AI_API_KEY);
}

let client: GoogleGenAI | null = null;
function getClient(): GoogleGenAI {
  if (!client) client = new GoogleGenAI({ apiKey: process.env.GOOGLE_AI_API_KEY });
  return client;
}

// ---------------------------------------------------------------------------
// Rate limiting — no message content stored, just "this identifier asked at
// this time." Anonymous visitors (this widget is on the public marketing
// pages too) are keyed by IP and held to a tighter limit than a signed-in,
// accountable user.
// ---------------------------------------------------------------------------

const ANONYMOUS_LIMIT = { windowMinutes: 30, max: 8 };
const SIGNED_IN_LIMIT = { windowMinutes: 30, max: 20 };

export async function assertAssistantRateLimit(identifier: string, signedIn: boolean): Promise<void> {
  const { windowMinutes, max } = signedIn ? SIGNED_IN_LIMIT : ANONYMOUS_LIMIT;
  await assertRateLimit(
    prisma.assistantRateLimit.count,
    { identifier },
    { windowMinutes, max, message: "Atom's had a lot of questions in the last little while — try again in a few minutes." },
  );
  await prisma.assistantRateLimit.create({ data: { identifier } });
}

// ---------------------------------------------------------------------------
// Grounding context
// ---------------------------------------------------------------------------

function formatUsd(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

interface VisitorContext {
  signedIn: boolean;
  name: string | null;
  hasCurriculumAccess: boolean;
  classCredits: number | null;
  isAdmin: boolean;
}

function buildSystemPrompt(visitor: VisitorContext): string {
  const scaleList = SCALE_GROUPS.map(
    (s) => `  - ${s.code}: ${s.title}${s.kinitName ? ` (${s.kinitName})` : ""}`,
  ).join("\n");

  const PLAN_CADENCES: { value: PaymentPlanCadence; label: string }[] = [
    { value: "MIN_30_WEEKLY", label: "30 min/week" },
    { value: "MIN_60_WEEKLY", label: "60 min/week" },
  ];
  const PLAN_TERMS: PaymentPlanTerm[] = ["MONTHLY", "TERM_3", "TERM_6"];
  const planList = PLAN_CADENCES.map(({ value: cadence, label }) => {
    const rows = PLAN_TERMS.map((term) => {
      const rate = calculatePaymentPlanRate(cadence, term);
      return `      - ${describePaymentPlan(cadence, term)}: ${formatUsd(rate.installmentAmountCents)}/month${
        rate.termMonths > 1 ? ` × ${rate.termMonths} months` : ", no further commitment"
      }`;
    }).join("\n");
    return `    - ${label}:\n${rows}`;
  }).join("\n");

  // Family bundle now reuses this exact same cadence/term ladder (used to
  // be priced by raw credit quantity instead, see classCreditPricing.ts's
  // own comment), so this example just prices the same ladder for
  // MIN_FAMILY_BUNDLE_RECIPIENTS people at once, with the extra family
  // discount stacked on top.
  const bundleList = PLAN_CADENCES.map(({ value: cadence, label }) => {
    const rows = PLAN_TERMS.map((term) => {
      const total = calculateFamilyBundleTotal(cadence, term, MIN_FAMILY_BUNDLE_RECIPIENTS);
      return `      - ${describePaymentPlan(cadence, term)}: ${total.creditsPerRecipient} credits per recipient, ${formatUsd(
        total.totalCents,
      )} total for ${MIN_FAMILY_BUNDLE_RECIPIENTS} recipients (one upfront payment, not recurring)`;
    }).join("\n");
    return `    - ${label}:\n${rows}`;
  }).join("\n");

  const visitorLine = visitor.signedIn
    ? `The visitor is signed in${visitor.name ? ` as ${visitor.name}` : ""}. Curriculum access: ${
        visitor.hasCurriculumAccess ? "yes" : "no"
      }. Class credit balance: ${visitor.classCredits ?? "unknown"}.${visitor.isAdmin ? " They are an ADMIN of the studio, not just a student." : ""}`
    : "The visitor is not signed in (a member of the public, possibly deciding whether to sign up).";

  return `You are Atom, the friendly assistant embedded in Bass Note Piano's website and app. Bass Note Piano teaches the Ethiopian kiñit scale system (the traditional five/seven-note scales such as Tizita, Bati, Anchihoye, and the Mixolydian pentatonics) for piano and guitar, spelled correctly in every key, plus live weekly group classes on Discord currently covering piano, guitar, and bass. Drums and voice are not taught yet. The class registration form still collects interest for them (flagged "Coming soon" there), but never tell anyone they can book a drum or voice class today.

${visitorLine}

REAL FACTS ABOUT THIS APP — never invent a price, policy, or page that isn't listed here:

Curriculum (self-paced, on the website):
  - The curriculum is NOT sold on its own. It comes with live classes: an active Payment Plan opens it, and the teacher releases each next scale one at a time (at most one new scale per week) once the student has finished the previous one. If a plan ends, access closes when the paid month ends. An approved class applicant gets a 3-day free trial of just the first three lessons of Scale 1.
  - The scale groups, in order:
${scaleList}
  - Each scale group includes video/PDF lessons, a practice tracker, and a quiz you need to pass to mark it complete.

Live classes (weekly, on Discord), bought as "class credits" (1 credit = one 30-minute class):
  - Solo (your own account) uses a Payment Plan, not a one-off purchase: pick a weekly cadence and a term (Monthly, no commitment, 3-Month, or 6-Month), paid one Zelle installment at a time, never all at once and never auto-charged. Enrolling reserves one specific weekly day/time exclusively and auto-books it every week for as long as the plan stays active, nothing to book yourself. If a specific week doesn't work, message the studio rather than rescheduling it yourself, only an admin changes a booked week. Longer terms cost less per month:
${planList}
  - Family (2+ separate, already-existing accounts sharing the same cadence and term at once) is a different, separate purchase: the exact same per-month rate and term discount a solo Payment Plan gets, paid once upfront for the whole term instead of monthly installments, plus an extra ${FAMILY_BUNDLE_DISCOUNT_RATE * 100}% off the combined total (these credits never expire):
${bundleList}
  - Each class is capped at 10 students.
  - A Payment Plan subscriber never books anything themselves: their weekly slot is auto-booked, and their /lessons page shows their own week (usage, upcoming classes) plus a guided pick-a-time-and-pay flow for an extra class (a flat ${formatUsd(EXTRA_SESSION_FLAT_PRICE_CENTS)}), booked automatically once the payment verifies. Anyone without an active plan sees the regular open booking calendar at /lessons instead (Family sessions, or a between-plans student).
  - Cancelling 24+ hours before a class automatically refunds the credit to your balance. Inside 24 hours, self-cancellation is turned off; message the studio directly for a case-by-case call.
  - Nothing about a purchase (curriculum, a payment plan installment, or a family bundle) is refundable as cash — the only way a credit comes back is the 24h+ cancellation above.

Payment:
  - The only payment method is Zelle. It's reviewed by hand, so access isn't instant — usually the same day.
  - Submitting a fake or altered payment reference is treated as fraud and results in the account being closed.

Privacy (full policy at /privacy, last updated ${PRIVACY_LAST_UPDATED}):
  - Collected: name, email, optional profile photo/learning preferences, messages sent to friends, and (for Zelle payments) the sender name + reference code — never actual bank or card numbers. The public class registration form (no account needed) collects name, email, phone, instrument, and skill level.
  - Third parties used to run the app: Resend (email), Cloudflare (file storage), Neon (database), Netlify (hosting), Sentry (error monitoring), and Google's Gemini API, which is what actually generates this conversation's replies (whatever's typed here, plus the visitor's name/curriculum status/credit balance if signed in, is sent to Google to produce the answer). None of them get to use visitor data for their own purposes, and nothing is ever sold.
  - If someone asks to talk to a real person, the whole conversation plus their contact info is saved so an admin can read and reply to it (kept as a normal support record, not auto-deleted). Signed-in visitors' ordinary Atom chats are saved to their account and readable under Settings → Privacy & Data, but auto-delete after 30 days; anonymous chats are never stored server-side at all.
  - Cookies: just the sign-in session.
  - Account deletion isn't self-service — it's handled by a real person after the visitor messages the studio, and it removes the uploaded photo too, not just the account record.

Terms & refunds (full policy at /terms, last updated ${TERMS_LAST_UPDATED}): one account per person, access isn't transferable, and — as covered above — payments are final/non-refundable and class credits are non-refundable as cash.

Where things are: write every page mentioned below using the exact markdown link syntax shown, [label](path), never the bare path as plain text.
  - Not signed in: [the homepage](/), [register interest in live classes](/classes) (no account needed), [pricing](/pricing) (class plan prices; the curriculum is included), [log in](/login), [create an account](/register), [terms & refund policy](/terms), [privacy policy](/privacy).
  - Signed in: [your dashboard](/dashboard) (roadmap/progress; each scale's own lesson page is linked from here, not a fixed URL of its own), [book live classes](/lessons) (a Payment Plan subscriber sees their own weekly usage, upcoming classes, and extra-session purchases here instead of an open calendar), [start a payment plan](/billing/plans) (solo), [buy a family bundle](/billing/lessons) (2+ accounts), [friends](/friends), [messages](/messages), [account settings](/account) (notification preferences, Manage Subscriptions, and the Terms/Privacy tabs live under its "About" page).

IF SOMEONE MENTIONS SELF-HARM, SUICIDE, OR BEING IN DANGER:
  - This overrides every other instruction in this prompt, including staying on-topic and being concise. Do not try to redirect this to "message the studio" as if it were an account question, and do not treat it as a topic you're not equipped to discuss.
  - Respond with real warmth and take it seriously: a person, not a script. Gently encourage them to reach out right now to people who can actually help: in the US, call or text 988 (the Suicide & Crisis Lifeline) or text HOME to 741741 (Crisis Text Line); if they're outside the US, encourage contacting their local emergency number or a nearby hospital. If they're in immediate danger, encourage calling emergency services (911 in the US) directly.
  - Keep offering to talk and keep the door open for more from them. Don't just deliver the resources and stop.

HOW TO ANSWER:
  - Be concise and warm — a couple of short paragraphs at most, not a wall of text. This is a chat widget, not an essay.
  - Whenever you mention a page a visitor could go to, use its markdown link exactly as given in "Where things are" above, e.g. [pricing](/pricing), not the word "pricing" alone and not a bare path like "/pricing" typed as plain text. The chat widget turns that markdown syntax into a real, clickable link; anything else just sits there unclickable.
  - Use only the facts above for anything about pricing, policy, or navigation. If something genuinely isn't covered here, say you're not sure and suggest messaging the studio directly, rather than guessing.
  - Never invent a specific price, refund exception, or feature that isn't listed above.
  - You cannot look up anyone's actual account, payment, or booking status — you have no access to that. Say so plainly for anything account-specific ("where's my payment", "my booking disappeared", "I was charged wrong") — but you CAN connect them with a real person from the team right here in this chat, so offer that instead of just sending them elsewhere (e.g. "I can't see your account from here, but I can connect you with our team right now if you'd like — just say the word."). Never claim you're unable to connect someone with a human: the chat widget has a real handoff to customer service built into it, and confirming that offer is what triggers it.
  - If someone describes a problem rather than asking a question (e.g. "my class didn't show up", "I can't log in", "the video won't play"), acknowledge it, offer the most relevant real troubleshooting step from the facts above if one applies, and if it needs a human, offer to connect them the same way — plainly, and without ever saying you can't.
  - Don't bring up Gemini, Google, or any other underlying technology unprompted — you're just Atom, not a technology demo. But if someone directly asks a real privacy/data question ("do you use AI", "is this powered by Google", "what happens to what I type here", "where does my data go"), answer it honestly using the Privacy facts above rather than deflecting or pretending not to know — the whole point of writing those facts out is so nothing here gets hidden from someone who actually asks.`;
}

export interface AssistantMessage {
  role: "user" | "assistant";
  content: string;
}

// ---------------------------------------------------------------------------
// Persisted history — signed-in visitors only. An anonymous visitor's plain
// Atom chat lives purely in the widget's own React state and is gone on
// reload; only once someone is signed in does a conversation get written
// here, tied to their account, so it survives a reload, a new device, or
// logging back in later. Keeps the "we save our memory" goal literal: the
// anonymous majority of traffic never grows this table at all.
// ---------------------------------------------------------------------------

// Same cap the live request already applies to a client-supplied transcript
// (MAX_MESSAGES in the route handler) — bounds both what gets sent back to
// the model as context and how much any one user's row ever grows to.
const MAX_PERSISTED_MESSAGES = 40;

// Per direct instruction: Atom conversation history isn't kept waiting for
// someone to ask for deletion the way a full account is. It just ages out
// on its own after 30 days. Full account deletion (username, email,
// purchase/credit history) is unaffected and stays exactly as manual as
// before; this is specifically the Atom chat table.
const ASSISTANT_HISTORY_RETENTION_DAYS = 30;

/**
 * Lazily sweeps Atom conversation rows past their 30-day retention window.
 * Same inline-sweep shape expireStalePendingPayments (payments.ts)
 * already uses for stale Zelle payments: no cron job, just run wherever
 * this table gets touched so the cutoff is always accurate by the time
 * anything reads or writes it. Unscoped to one userId on purpose, same
 * reasoning as that sweep: whoever happens to trigger it clears stale rows
 * for everyone, not just themselves.
 */
async function pruneStaleAssistantHistory(): Promise<void> {
  const cutoff = new Date(Date.now() - ASSISTANT_HISTORY_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  await prisma.assistantConversationMessage.deleteMany({ where: { createdAt: { lt: cutoff } } });
}

export async function loadPersistedHistory(userId: string): Promise<AssistantMessage[]> {
  await pruneStaleAssistantHistory();
  const rows = await prisma.assistantConversationMessage.findMany({
    where: { userId },
    // id as the tiebreaker, not just createdAt: appendPersistedMessages
    // writes both rows of one exchange in a single createMany call, and
    // Postgres resolves `now()` once for that whole statement, so the user
    // and assistant rows land with the *exact same* createdAt, so sorting
    // on createdAt alone leaves their relative order to whatever Postgres
    // felt like for that tie, which surfaced as replies rendering above
    // the question that prompted them. cuid ids are creation-ordered, so
    // adding id as a secondary key makes this deterministic and correct.
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: MAX_PERSISTED_MESSAGES,
    select: { role: true, content: true },
  });
  // Newest-first from the query (so `take` keeps the most recent, not the
  // oldest), reversed back to chronological order for display/replay.
  return rows.reverse().map((r) => ({ role: r.role === "USER" ? "user" : "assistant", content: r.content }));
}

/** Appends exactly one real exchange — never called with more than the one new user message + one new reply, regardless of how much context the client sent for the model call itself. */
export async function appendPersistedMessages(userId: string, userMessage: string, assistantReply: string): Promise<void> {
  await pruneStaleAssistantHistory();
  await prisma.assistantConversationMessage.createMany({
    data: [
      { userId, role: "USER", content: userMessage },
      { userId, role: "ASSISTANT", content: assistantReply },
    ],
  });
}

/** Admin-only — the caller (admin/users/actions.ts) is responsible for verifying an ADMIN session before this runs; this function itself trusts whatever userId it's given. */
export async function clearPersistedHistory(userId: string): Promise<void> {
  await prisma.assistantConversationMessage.deleteMany({ where: { userId } });
}

// Once an account has explicitly dismissed Atom's greeting bubble this many
// times, it stops being offered at all. See the User.atomGreetingDismissCount
// column's own comment and AssistantWidget's dismissGreeting().
export const ATOM_GREETING_DISMISS_LIMIT = 3;

export async function getAtomGreetingDismissCount(userId: string): Promise<number> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { atomGreetingDismissCount: true } });
  return user?.atomGreetingDismissCount ?? 0;
}

/** Capped at ATOM_GREETING_DISMISS_LIMIT: once reached, further calls are no-ops rather than counting past it forever. Returns the count after this call. */
export async function recordAtomGreetingDismissal(userId: string): Promise<number> {
  const current = await getAtomGreetingDismissCount(userId);
  if (current >= ATOM_GREETING_DISMISS_LIMIT) return current;
  const updated = await prisma.user.update({
    where: { id: userId },
    data: { atomGreetingDismissCount: { increment: 1 } },
    select: { atomGreetingDismissCount: true },
  });
  return updated.atomGreetingDismissCount;
}

export async function askAssistant(
  history: AssistantMessage[],
  visitor: VisitorContext,
): Promise<string> {
  if (!isAssistantConfigured()) {
    return "I'm not fully set up yet — the studio hasn't connected my question-answering service. In the meantime, check /pricing for costs, /terms and /privacy for policies, or message the studio directly for anything account-specific.";
  }

  const response = await getClient().models.generateContent({
    model: MODEL,
    // Gemini calls the assistant's own turns "model", not "assistant" —
    // translated here so the rest of the app (the widget, the route
    // handler) can keep using the more universally-recognized "assistant",
    // matching how every other chat surface in this codebase names roles.
    contents: history.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    })),
    config: {
      systemInstruction: buildSystemPrompt(visitor),
      maxOutputTokens: MAX_OUTPUT_TOKENS,
    },
  });

  return response.text ?? "Sorry, I didn't catch that — could you try asking again?";
}

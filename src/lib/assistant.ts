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
import { prisma } from "@/lib/prisma";
import { assertRateLimit, RateLimitError } from "@/lib/rateLimit";
import { CURRICULUM_PRICE_CENTS, SCALE_GROUPS } from "@/lib/curriculum";
import { CREDIT_BASE_PRICE_CENTS, PRESET_BUNDLES, calculateClassCreditTotal } from "@/lib/classCreditPricing";
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

  const bundleList = PRESET_BUNDLES.map((b) => {
    const total = calculateClassCreditTotal(b.quantity);
    return `  - ${b.label}: ${b.quantity} credits for ${formatUsd(total.totalCents)} (${Math.round(total.discountRate * 100)}% off)`;
  }).join("\n");

  const visitorLine = visitor.signedIn
    ? `The visitor is signed in${visitor.name ? ` as ${visitor.name}` : ""}. Curriculum access: ${
        visitor.hasCurriculumAccess ? "yes" : "no"
      }. Class credit balance: ${visitor.classCredits ?? "unknown"}.${visitor.isAdmin ? " They are an ADMIN of the studio, not just a student." : ""}`
    : "The visitor is not signed in (a member of the public, possibly deciding whether to sign up).";

  return `You are Atom, the friendly assistant embedded in Bass Note Piano's website and app. Bass Note Piano teaches the Ethiopian kiñit scale system (the traditional five/seven-note scales such as Tizita, Bati, Anchihoye, and the Mixolydian pentatonics) for piano and guitar, spelled correctly in every key, plus live weekly group classes on Zoom covering piano, guitar, bass, drums, and voice.

${visitorLine}

REAL FACTS ABOUT THIS APP — never invent a price, policy, or page that isn't listed here:

Curriculum (self-paced, on the website):
  - One-time payment of ${formatUsd(CURRICULUM_PRICE_CENTS)} unlocks all six scale groups, forever. No subscription.
  - The six scale groups, in required order (you can't skip ahead without curriculum access, and even then skipping asks for confirmation first):
${scaleList}
  - Each scale group includes video/PDF lessons, a practice tracker, and a quiz you need to pass to mark it complete.

Live classes (weekly, on Zoom):
  - Bought as "class credits": ${formatUsd(CREDIT_BASE_PRICE_CENTS)} per credit, 1 credit = one 30-minute class.
  - Bundle discounts (buying more at once lowers the per-credit price, credits themselves never expire):
${bundleList}
  - Each class is capped at 10 students.
  - Booking happens on the /lessons page once signed in — you can select and book several open sessions at once instead of one at a time.
  - Cancelling 24+ hours before a class automatically refunds the credit to your balance. Inside 24 hours, self-cancellation is turned off; message the studio directly for a case-by-case call.
  - Nothing about a purchase (curriculum or credits) is refundable as cash — the only way a credit comes back is the 24h+ cancellation above.

Payment:
  - The only payment method is Zelle. It's reviewed by hand, so access isn't instant — usually the same day.
  - Submitting a fake or altered payment reference is treated as fraud and results in the account being closed.

Privacy (full policy at /privacy, last updated ${PRIVACY_LAST_UPDATED}):
  - Collected: name, email, optional profile photo/learning preferences, messages sent to friends, and (for Zelle payments) the sender name + reference code — never actual bank or card numbers.
  - Third parties used to run the app: Resend (email), Cloudflare (file storage), Neon (database), Netlify (hosting), Sentry (error monitoring). None of them get to use visitor data for their own purposes, and nothing is ever sold.
  - The only cookie set is the sign-in session cookie.
  - Account deletion isn't self-service — it's handled by a real person after the visitor messages the studio.

Terms & refunds (full policy at /terms, last updated ${TERMS_LAST_UPDATED}): one account per person, access isn't transferable, and — as covered above — the curriculum purchase is final/non-refundable and class credits are non-refundable as cash.

Where things are:
  - Not signed in: / (home), /classes (register interest in live classes — no account needed), /pricing (curriculum + credit prices), /login, /register, /terms, /privacy.
  - Signed in: /dashboard (your roadmap/progress), /scales/[slug] (a scale's lessons), /lessons (book live classes), /billing/curriculum and /billing/lessons (buy access), /friends, /messages, /account (settings, including notification preferences and the Terms/Privacy tabs under the "About" page).

HOW TO ANSWER:
  - Be concise and warm — a couple of short paragraphs at most, not a wall of text. This is a chat widget, not an essay.
  - Use only the facts above for anything about pricing, policy, or navigation. If something genuinely isn't covered here, say you're not sure and suggest messaging the studio directly, rather than guessing.
  - Never invent a specific price, refund exception, or feature that isn't listed above.
  - You cannot look up anyone's actual account, payment, or booking status — you have no access to that. Say so plainly for anything account-specific ("where's my payment", "my booking disappeared", "I was charged wrong") — but you CAN connect them with a real person from the team right here in this chat, so offer that instead of just sending them elsewhere (e.g. "I can't see your account from here, but I can connect you with our team right now if you'd like — just say the word."). Never claim you're unable to connect someone with a human: the chat widget has a real handoff to customer service built into it, and confirming that offer is what triggers it.
  - If someone describes a problem rather than asking a question (e.g. "my class didn't show up", "I can't log in", "the video won't play"), acknowledge it, offer the most relevant real troubleshooting step from the facts above if one applies, and if it needs a human, offer to connect them the same way — plainly, and without ever saying you can't.
  - Never mention Gemini, Google, or any other underlying technology you're built on — you're just Atom.`;
}

export interface AssistantMessage {
  role: "user" | "assistant";
  content: string;
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

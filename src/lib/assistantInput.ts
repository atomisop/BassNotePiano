/**
 * Pure helpers for what the Atom route accepts, kept apart from the route so they can be tested without a server.
 * Nothing here trusts the request: identity is never read from the body, only the chat messages are.
 */

export interface AssistantMessage {
  role: "user" | "assistant";
  content: string;
}

export const MAX_MESSAGE_LENGTH = 2000;
/** The request body (all messages together) may not be larger than this many characters. */
export const MAX_BODY_CHARS = 64_000;

/** Keeps the last `maxMessages` well-formed turns, cuts each to the length limit, and ignores every other field. */
export function sanitizeAssistantHistory(raw: unknown, maxMessages: number): AssistantMessage[] {
  if (!Array.isArray(raw)) return [];
  const out: AssistantMessage[] = [];
  for (const m of raw.slice(-Math.max(1, maxMessages))) {
    if (typeof m !== "object" || m === null) continue;
    const { role, content } = m as { role?: unknown; content?: unknown };
    if ((role !== "user" && role !== "assistant") || typeof content !== "string") continue;
    out.push({ role, content: content.slice(0, MAX_MESSAGE_LENGTH) });
  }
  return out;
}

/**
 * The address a visitor's anonymous limit is keyed on. Netlify sets its own client-address header, which a visitor cannot
 * choose. Failing that, the LAST x-forwarded-for entry is the one the nearest proxy added; the first can be typed by the visitor.
 */
export function clientAddress(h: Pick<Headers, "get">): string {
  const platform = h.get("x-nf-client-connection-ip")?.trim();
  if (platform) return platform;
  const parts = (h.get("x-forwarded-for") ?? "").split(",").map((p) => p.trim()).filter(Boolean);
  return parts[parts.length - 1] ?? "unknown";
}

export interface RateWindow {
  windowMinutes: number;
  max: number;
}

/** Several windows at once: a burst cap, the existing half hour, and a daily cap. */
export function assistantRateWindows(signedIn: boolean): RateWindow[] {
  return signedIn
    ? [{ windowMinutes: 1, max: 6 }, { windowMinutes: 30, max: 20 }, { windowMinutes: 24 * 60, max: 80 }]
    : [{ windowMinutes: 1, max: 3 }, { windowMinutes: 30, max: 8 }, { windowMinutes: 24 * 60, max: 25 }];
}

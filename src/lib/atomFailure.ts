// What went wrong when Atom could not get an answer from Gemini, and whether
// the owner needs to hear about it. Pure (no imports) so the rules are tested;
// the database and email side is atomHealth.ts.

export type GeminiFailureKind = "credits" | "key" | "busy" | "other";

const CREDIT_WORDS = /quota|billing|credit|prepay|balance|resource_exhausted|insufficient/i;
const KEY_WORDS = /api key not valid|api_key_invalid|permission_denied|unauthenticated|expired/i;

/** Credits and key problems stay broken until the owner acts. Busy is Google being slow or down, and usually passes. */
export function classifyGeminiFailure(status: number, detail: string): GeminiFailureKind {
  if (status === 0) return "busy"; // network error or timeout
  if (status === 402) return "credits";
  if ((status === 401 || status === 403 || status === 429) && CREDIT_WORDS.test(detail)) return "credits";
  if (status === 429) return "busy"; // a rate limit, not an empty balance
  if (status === 401 || status === 403) return "key";
  if (status === 400 && KEY_WORDS.test(detail)) return "key";
  if (status === 408 || status >= 500) return "busy";
  return "other";
}

export class GeminiError extends Error {
  constructor(
    readonly status: number,
    readonly detail: string,
  ) {
    super(`Gemini API ${status}: ${detail}`);
    this.name = "GeminiError";
  }
  get kind(): GeminiFailureKind {
    return classifyGeminiFailure(this.status, this.detail);
  }
}

/** What a visitor is told. Never includes anything about keys, credits or Google. */
export const ATOM_UNAVAILABLE_MESSAGE = "Atom can't answer right now. A person at the studio can help instead.";

export const ATOM_ALERT_REPEAT_HOURS = 12;
/** A run of temporary failures only counts as a problem at this many inside the window. */
export const ATOM_BUSY_FAILURES = 5;
export const ATOM_BUSY_WINDOW_MINUTES = 10;
export const ATOM_RECOVERED = "recovered";

/** Credits and key problems are their own alerts; everything temporary or unknown is "busy". */
export function atomAlertNote(kind: GeminiFailureKind): "credits" | "key" | "busy" {
  return kind === "credits" || kind === "key" ? kind : "busy";
}

export function shouldAlertAtom(input: {
  kind: GeminiFailureKind;
  /** Failures recorded in the last ATOM_BUSY_WINDOW_MINUTES, including this one. */
  recentFailures: number;
  last: { note: string | null; ranAt: Date } | null;
  now: Date;
}): boolean {
  const { kind, recentFailures, last, now } = input;
  const needsOwner = kind === "credits" || kind === "key" || recentFailures >= ATOM_BUSY_FAILURES;
  if (!needsOwner) return false;
  if (!last || last.note === ATOM_RECOVERED) return true;
  if (last.note !== atomAlertNote(kind)) return true; // it got worse or changed
  return now.getTime() - last.ranAt.getTime() > ATOM_ALERT_REPEAT_HOURS * 3_600_000;
}

export function shouldAnnounceAtomRecovery(last: { note: string | null } | null): boolean {
  return last !== null && last.note !== ATOM_RECOVERED;
}

export const GEMINI_BILLING_URL = "https://aistudio.google.com/billing";

export function describeAtomAlert(note: "credits" | "key" | "busy"): { subject: string; body: string; ctaLabel: string; external: boolean } {
  if (note === "credits") {
    return {
      subject: "Atom can't answer: Gemini credits look used up",
      body:
        "Gemini refused Atom's last request because the prepaid credits or quota look used up. Visitors are being told Atom can't answer and are offered a person instead. " +
        "Add credits in Gemini billing (auto-reload stops this happening again). You will get one more email when Atom is working.",
      ctaLabel: "Open Gemini billing",
      external: true,
    };
  }
  if (note === "key") {
    return {
      subject: "Atom can't answer: Gemini rejected the key",
      body:
        "Gemini refused Atom's last request as unauthorized. Check that the key is still active in Google AI Studio and that GOOGLE_AI_API_KEY in Netlify matches it, then redeploy. " +
        "Visitors are being offered a person instead. You will get one more email when Atom is working.",
      ctaLabel: "Open Gemini billing",
      external: true,
    };
  }
  return {
    subject: "Atom keeps failing",
    body:
      "Atom has failed several times in a few minutes. This is usually Google being slow or briefly down and passes by itself. " +
      "Visitors are being offered a person instead. You will get one more email when Atom is working.",
    ctaLabel: "Open admin",
    external: false,
  };
}

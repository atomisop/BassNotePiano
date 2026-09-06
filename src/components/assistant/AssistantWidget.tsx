"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { AnimatePresence, motion } from "framer-motion";
import Loader from "@/components/ui/loader-15";
import { MorphingSquare } from "@/components/ui/morphing-square";
import { readConsent, CONSENT_DECIDED_EVENT } from "@/lib/cookieConsent";
import { FULLSCREEN_NAV_EVENT } from "@/lib/overlayNav";

/**
 * Atom — the "ask me anything" assistant, floating on every page (mounted
 * once in providers.tsx, same pattern as Toaster/CookieConsentBanner).
 *
 * The launcher (and the open panel's header icon) run the `loader-15` ui
 * component — a signal-green animated gradient ring, `components/ui/
 * loader-15.tsx` — as Atom's icon. Atom used to run its own distinct
 * color identity here (teal/blue, before that whatever the house accent
 * wasn't at the time — see themes.css's own "Accent" comment), on the
 * theory that it should read as its own character rather than blend into
 * the app's chrome. Reverted by direct instruction: Atom now matches the
 * app exactly, everywhere below, including the signal green that's the
 * house accent again — no separate identity anymore. This replaces an
 * earlier
 * `PulsingBorder` WebGL shader treatment (this app's own signal-green
 * identity): that version needed its own feature-detection-and-fallback
 * machinery (a shader canvas that *throws*, not warns, on a device with no
 * WebGL — real production error-monitoring events showed visitors on
 * locked-down/older hardware hitting a broken widget from it). `Loader`
 * is plain SVG, so none of that applies here — there's no fallback branch
 * because there's nothing left that can fail that way.
 *
 * MOBILE OVERLAY SUPPRESSION: the launcher is portaled straight to
 * `document.body` at `z-40`, same as MarketingNav's mobile menu and the
 * dashboard's MoreSheet (`z-50`, also body-portaled). That numeric gap
 * should keep Atom behind either one, but a visitor reported seeing the
 * launcher float on top of the open mobile menu regardless — see
 * `lib/overlayNav.ts` for why this doesn't just trust the z-index. Both
 * overlays broadcast `FULLSCREEN_NAV_EVENT` while open; this widget listens
 * and hides itself (`navOverlayOpen` below) for as long as one is up.
 *
 * Positioned at bottom-24 (not bottom-6, where ScrollToTopButton and the
 * marketing pages' footer live) specifically to clear that button and the
 * signed-in AppDock, which is centered but still close to the bottom edge.
 *
 * That 96px is a plain fixed value, though, and AppDock's own bottom offset
 * isn't: AppDock adds `pb-[env(safe-area-inset-bottom)]` on top of its
 * `bottom-4`, so on a real notched/Dynamic-Island iPhone (a ~34px inset)
 * the dock's whole row shifts up by that same amount while this launcher,
 * reading no such inset, stays put — eating most of the ~20px clearance the
 * fixed 96px was sized around and letting the launcher dip down over
 * whatever dock icon sits beneath it (reported as "the text is cut out,"
 * a dock label rendering underneath Atom's loader ring). `env(...)`
 * resolves to 0 on anything without a safe area (desktop, older phones),
 * so this changes nothing there — it only restores the original ~20px gap
 * on devices where AppDock itself already moved.
 *
 * Also owns several self-contained additions layered on top of the plain
 * chat, none of which touch the LLM prompt itself:
 *  - a thumbs up/down under every Atom reply (POSTs to /api/assistant/feedback);
 *  - a suggestion-chip row that's always available before a handoff;
 *  - a small, deterministic (non-LLM) triage: a thumbs-down or an "I need a
 *    human" kind of message offers a handoff, which — once confirmed —
 *    POSTs the transcript to /api/assistant/escalate. From there the widget
 *    switches into live "support mode": the composer talks to
 *    /api/assistant/support/[id] instead of the LLM, polling the same
 *    endpoint for whatever an admin replies with from /admin/support. A
 *    support reply always renders labeled "Support" — never the admin's
 *    real name, which the visitor-facing API never even returns.
 */

const GREETING_TEXT = "Hi I am Atom, your personal assistant. Ask me anything related to Bass Note Piano";
const GREETING_SEEN_KEY = "bnp-atom-greeting-seen";
const FEEDBACK_KEY = "bnp-atom-feedback";
const ESCALATION_ID_KEY = "bnp-atom-escalation-id";
const GREETING_DELAY_MS = 1800;
const SUPPORT_POLL_MS = 4000;

const SUGGESTIONS = [
  "How much does the curriculum cost?",
  "How do I book a class?",
  "What's the refund policy?",
  "I need help with my account",
];

// Simple, deterministic triage — no reliance on the model to self-report
// when it's stuck, which would mean trusting free-form LLM output to
// trigger a real notification. A visitor asking in plain English to reach
// a person is a clear, checkable signal on its own.
const HUMAN_REQUEST_RE = /\b(human|real\s+person|representative|customer\s+service|talk\s+to\s+(a\s+|someone)|speak\s+(to|with))\b/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface Message {
  role: "user" | "assistant";
  content: string;
}

type FeedbackRating = "UP" | "DOWN";
type ThreadSender = "VISITOR" | "ATOM" | "SUPPORT";
type ThreadStatus = "OPEN" | "RESOLVED";

interface ThreadMessage {
  id: string;
  sender: ThreadSender;
  body: string;
}

const THREAD_SENDER_LABEL: Record<ThreadSender, string> = { VISITOR: "You", ATOM: "Atom", SUPPORT: "Support" };

function readStoredFeedback(): Record<number, FeedbackRating> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.sessionStorage.getItem(FEEDBACK_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function readStoredEscalationId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage.getItem(ESCALATION_ID_KEY);
  } catch {
    return null;
  }
}

function AtomButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="relative flex h-[60px] w-[60px] shrink-0 items-center justify-center rounded-full transition hover:scale-105 active:scale-95"
    >
      <Loader size={60} />
    </button>
  );
}

// Deliberately tiny and low-contrast — a CSAT prompt that competed
// visually with the actual answer would be worse than no CSAT prompt at
// all. Rating stays changeable (clicking the other icon switches it,
// clicking the already-selected one is a no-op) rather than locking in
// after the first click — a visitor who mis-tapped, or who changes their
// mind after Atom's follow-up actually helps, isn't stuck with their first
// answer.
function FeedbackButtons({
  rating,
  busy,
  onRate,
}: {
  rating: FeedbackRating | null;
  busy: boolean;
  onRate: (rating: FeedbackRating) => void;
}) {
  return (
    <div className="mt-1 flex items-center gap-1 pl-1">
      <span className="text-[10px] text-slate-600">Was this answer satisfying?</span>
      <button
        type="button"
        onClick={() => onRate("UP")}
        disabled={busy}
        aria-label="Helpful"
        aria-pressed={rating === "UP"}
        className={`flex h-5 w-5 items-center justify-center rounded transition ${
          rating === "UP" ? "text-amber-400" : "text-slate-600 hover:text-slate-400"
        } disabled:cursor-default disabled:opacity-60`}
      >
        <svg viewBox="0 0 24 24" fill={rating === "UP" ? "currentColor" : "none"} className="h-3 w-3">
          <path
            d="M7 22h11a2 2 0 002-2v-7a2 2 0 00-2-2h-3l1-5.5A1.5 1.5 0 0014.5 4L10 9H7v13zM3 22h2V9H3v13z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      <button
        type="button"
        onClick={() => onRate("DOWN")}
        disabled={busy}
        aria-label="Not helpful"
        aria-pressed={rating === "DOWN"}
        className={`flex h-5 w-5 items-center justify-center rounded transition ${
          rating === "DOWN" ? "text-red-400" : "text-slate-600 hover:text-slate-400"
        } disabled:cursor-default disabled:opacity-60`}
      >
        <svg viewBox="0 0 24 24" fill={rating === "DOWN" ? "currentColor" : "none"} className="h-3 w-3">
          <path
            d="M17 2H6a2 2 0 00-2 2v7a2 2 0 002 2h3l-1 5.5A1.5 1.5 0 0010.5 20L15 15h3V2zM21 2h-2v13h2V2z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </div>
  );
}

// Atom's replies point people at real in-app pages using plain markdown
// link syntax (the system prompt writes "/messages" etc. as real paths) —
// this turns [label](url) into an actual clickable link instead of showing
// the bracket/paren syntax as literal text. Deliberately minimal: this is
// the only markdown construct the model is asked to use, so a full markdown
// renderer would be solving a problem that doesn't exist here. Shared by
// both bubble components below since a seeded transcript message can appear
// in either one (pre-handoff in MessageBubble, replayed inside the thread
// in ThreadMessageBubble).
const MARKDOWN_LINK = /\[([^\]]+)\]\(([^)]+)\)/g;

function renderMessageContent(content: string, accentLink: boolean) {
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;

  for (const match of Array.from(content.matchAll(MARKDOWN_LINK))) {
    const [full, label, href] = match;
    const index = match.index ?? 0;
    if (index > lastIndex) parts.push(<Fragment key={key++}>{content.slice(lastIndex, index)}</Fragment>);
    parts.push(
      <Link
        key={key++}
        href={href}
        className={`underline underline-offset-2 ${accentLink ? "text-slate-950" : "text-amber-400 hover:opacity-70"}`}
      >
        {label}
      </Link>,
    );
    lastIndex = index + full.length;
  }
  if (lastIndex < content.length) parts.push(<Fragment key={key++}>{content.slice(lastIndex)}</Fragment>);
  return parts;
}

function MessageBubble({
  message,
  feedback,
  feedbackBusy,
  onRate,
}: {
  message: Message;
  feedback: FeedbackRating | null;
  feedbackBusy: boolean;
  onRate: (rating: FeedbackRating) => void;
}) {
  const isMine = message.role === "user";
  return (
    <div className={`flex flex-col ${isMine ? "items-end" : "items-start"}`}>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", bounce: 0, duration: 0.4 }}
        className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm ${
          isMine ? "bg-amber-400 text-slate-950" : "border border-ink/10 bg-slate-950 text-slate-100"
        }`}
      >
        <p className="whitespace-pre-wrap break-words">{renderMessageContent(message.content, isMine)}</p>
      </motion.div>
      {!isMine && <FeedbackButtons rating={feedback} busy={feedbackBusy} onRate={onRate} />}
    </div>
  );
}

// Post-handoff rendering — every bubble here carries an explicit sender
// label (never ambiguous the way a plain LLM reply is), and SUPPORT gets
// its own accent so "a real person just replied" reads at a glance rather
// than blending into Atom's own messages.
function ThreadMessageBubble({ message }: { message: ThreadMessage }) {
  const isVisitor = message.sender === "VISITOR";
  return (
    <div className={`flex flex-col ${isVisitor ? "items-end" : "items-start"}`}>
      <span className="mb-1 px-1 text-[10px] uppercase tracking-wide text-slate-600">{THREAD_SENDER_LABEL[message.sender]}</span>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", bounce: 0, duration: 0.4 }}
        className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm ${
          isVisitor
            ? "bg-amber-400 text-slate-950"
            : message.sender === "SUPPORT"
              ? "border border-amber-400/35 bg-amber-400/10 text-slate-100"
              : "border border-ink/10 bg-slate-950 text-slate-100"
        }`}
      >
        <p className="whitespace-pre-wrap break-words">{renderMessageContent(message.body, isVisitor)}</p>
      </motion.div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex justify-start">
      <div className="flex items-center gap-1 rounded-2xl border border-ink/10 bg-slate-950 px-4 py-3">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="h-1.5 w-1.5 rounded-full bg-slate-500"
            animate={{ opacity: [0.3, 1, 0.3] }}
            transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.15 }}
          />
        ))}
      </div>
    </div>
  );
}

export function AssistantWidget() {
  const { data: session } = useSession();
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [showGreeting, setShowGreeting] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Feedback (thumbs) — keyed by index into `messages`, which never
  // reorders/truncates client-side, so the index stays a stable key for the
  // lifetime of one stored history.
  const [feedback, setFeedback] = useState<Record<number, FeedbackRating>>({});
  const [feedbackBusy, setFeedbackBusy] = useState<number | null>(null);

  // Triage/handoff offer — entirely client-side state, never sent anywhere
  // until the visitor explicitly confirms they want a person.
  const [escalationOffer, setEscalationOffer] = useState(false);
  const [collectingEmail, setCollectingEmail] = useState(false);
  const [escalationEmail, setEscalationEmail] = useState("");
  const [escalationSubmitting, setEscalationSubmitting] = useState(false);
  const [escalationError, setEscalationError] = useState<string | null>(null);

  // Live support mode — once set, the composer talks to the support thread
  // instead of the LLM, and threadMessages (fetched/polled from the server)
  // replaces `messages` as the render source.
  const [activeEscalationId, setActiveEscalationId] = useState<string | null>(null);
  const [threadMessages, setThreadMessages] = useState<ThreadMessage[]>([]);
  const [threadStatus, setThreadStatus] = useState<ThreadStatus | null>(null);

  // See lib/overlayNav.ts — true while MarketingNav's mobile menu or the
  // dashboard's MoreSheet is open, so the launcher steps aside instead of
  // floating on top of a full-screen overlay it's supposed to sit behind.
  const [navOverlayOpen, setNavOverlayOpen] = useState(false);
  useEffect(() => {
    function onFullscreenNav(e: Event) {
      setNavOverlayOpen(Boolean((e as CustomEvent<boolean>).detail));
    }
    window.addEventListener(FULLSCREEN_NAV_EVENT, onFullscreenNav);
    return () => window.removeEventListener(FULLSCREEN_NAV_EVENT, onFullscreenNav);
  }, []);

  // Portals need a real document — same SSR-safety pattern as NotificationBell.
  useEffect(() => {
    setMounted(true);
    setFeedback(readStoredFeedback());
    setActiveEscalationId(readStoredEscalationId());
  }, []);

  // Per direct instruction: the live widget always opens on a clean slate,
  // signed in or not. Nothing here ever hydrates `messages` from
  // /api/assistant/history on mount. A signed-in visitor's conversation is
  // still saved server-side on every exchange (see appendPersistedMessages,
  // called from the API route), it's just no longer replayed back into this
  // chat window; Settings → Privacy → History → Atom is where that history
  // is actually readable now (see AssistantHistorySection.tsx). An
  // anonymous visitor's chat was never stored server-side at all, so for
  // them this was already true.

  useEffect(() => {
    if (!mounted) return;
    try {
      window.sessionStorage.setItem(FEEDBACK_KEY, JSON.stringify(feedback));
    } catch {
      // Non-fatal, same reasoning as the history save above.
    }
  }, [feedback, mounted]);

  useEffect(() => {
    if (!mounted) return;
    try {
      if (activeEscalationId) window.sessionStorage.setItem(ESCALATION_ID_KEY, activeEscalationId);
      else window.sessionStorage.removeItem(ESCALATION_ID_KEY);
    } catch {
      // Non-fatal — worst case a reload loses the live thread and the
      // widget falls back to plain Atom chat.
    }
  }, [activeEscalationId, mounted]);

  // sessionStorage clears on tab close, so a signed-in visitor who closes
  // and reopens the tab would otherwise lose their live thread entirely —
  // this re-finds it server-side by account instead. Anonymous visitors
  // have no account to look it up by, so they stay scoped to whatever their
  // browser still remembers, same as the rest of the widget's history.
  useEffect(() => {
    if (!mounted || activeEscalationId || !session?.user?.id) return;
    let cancelled = false;
    fetch("/api/assistant/support/active")
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled && data?.escalationId) setActiveEscalationId(data.escalationId);
      })
      .catch(() => {
        // Best-effort — worst case they just stay in plain Atom chat.
      });
    return () => {
      cancelled = true;
    };
  }, [mounted, session?.user?.id, activeEscalationId]);

  // Polls the live thread while it's open on screen — no point spending
  // requests on a panel the visitor isn't looking at.
  useEffect(() => {
    if (!activeEscalationId || !open) return;
    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch(`/api/assistant/support/${activeEscalationId}`);
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (cancelled) return;
        setThreadMessages(data.messages);
        setThreadStatus(data.status);
      } catch {
        // Best-effort — the next poll tick will retry.
      }
    }
    poll();
    const interval = setInterval(poll, SUPPORT_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [activeEscalationId, open]);

  // Greeting bubble: once per browser session, only if the conversation is
  // still empty (a returning visitor mid-conversation doesn't need re-pitching).
  //
  // Also held back until the cookie banner is decided: both this bubble and
  // CookieConsentBanner are fixed, bottom-right, glass-surfaced elements, and
  // on a visitor's very first page load they used to show at the same time,
  // their overlapping backdrop-blurs compositing into a genuinely broken-
  // looking mess ("the shop page is glitched"). The browser's own `storage`
  // event only fires in *other* tabs, never the one that made the write, so
  // waiting on that wouldn't catch the same-tab decision that matters here.
  // `CONSENT_DECIDED_EVENT` is dispatched by `writeConsent()` specifically
  // for this.
  useEffect(() => {
    if (!mounted || messages.length > 0) return;
    if (window.sessionStorage.getItem(GREETING_SEEN_KEY)) return;

    let timer: ReturnType<typeof setTimeout> | undefined;
    const arm = () => {
      timer = setTimeout(() => setShowGreeting(true), GREETING_DELAY_MS);
    };

    if (readConsent() !== null) {
      arm();
      return () => clearTimeout(timer);
    }

    const onDecided = () => arm();
    window.addEventListener(CONSENT_DECIDED_EVENT, onDecided, { once: true });
    return () => {
      window.removeEventListener(CONSENT_DECIDED_EVENT, onDecided);
      clearTimeout(timer);
    };
  }, [mounted, messages.length]);

  function dismissGreeting() {
    setShowGreeting(false);
    try {
      window.sessionStorage.setItem(GREETING_SEEN_KEY, "1");
    } catch {
      // Non-fatal — worst case the greeting reappears once more.
    }
  }

  function openPanel() {
    dismissGreeting();
    setOpen(true);
    setTimeout(() => inputRef.current?.focus(), 250);
  }

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open]);

  // overscroll-contain on the message list (below) stops wheel/trackpad
  // scroll from chaining to the page once the list hits its own top/bottom
  // — but that CSS property is unreliable for touch scrolling on iOS
  // Safari specifically, which is exactly where "the page behind the chat
  // scrolls too" was actually reported from. Locking body scroll outright
  // while the panel is open is the same fix OnboardingTour.tsx already uses
  // for this identical problem, and it's not touch/browser-dependent.
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, threadMessages, loading, escalationOffer, collectingEmail]);

  async function sendAtomMessage(trimmed: string) {
    const nextHistory: Message[] = [...messages, { role: "user", content: trimmed }];
    setMessages(nextHistory);
    setLoading(true);

    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextHistory }),
      });
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setError(data?.error ?? "Something went wrong — try again in a moment.");
        return;
      }

      setMessages([...nextHistory, { role: "assistant", content: data.reply as string }]);
      // A plain-English ask for a human is offered a handoff regardless of
      // how the reply itself reads — this check is on what the visitor
      // typed, not on anything the model said.
      if (HUMAN_REQUEST_RE.test(trimmed)) offerHandoff();
    } catch {
      setError("Couldn't reach Atom — check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  async function sendSupportMessage(trimmed: string) {
    setLoading(true);
    try {
      const res = await fetch(`/api/assistant/support/${activeEscalationId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "Something went wrong sending that — try again in a moment.");
        return;
      }
      setThreadMessages(data.messages);
      setThreadStatus(data.status);
    } catch {
      setError("Couldn't send that — check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading || isResolved) return;
    setInput("");
    setError(null);
    if (activeEscalationId) {
      await sendSupportMessage(trimmed);
    } else {
      await sendAtomMessage(trimmed);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    sendMessage(input);
  }

  function offerHandoff() {
    if (activeEscalationId) return; // already talking to a person
    setEscalationOffer(true);
    setCollectingEmail(false);
    setEscalationError(null);
  }

  async function handleRate(index: number, rating: FeedbackRating) {
    // Re-clicking the already-selected rating is a no-op; switching to the
    // other one is always allowed (see the FeedbackButtons comment above).
    if (feedback[index] === rating || feedbackBusy === index) return;
    setFeedbackBusy(index);
    setFeedback((prev) => ({ ...prev, [index]: rating }));
    try {
      await fetch("/api/assistant/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating, messageContent: messages[index]?.content ?? "" }),
      });
    } catch {
      // Best-effort — a failed feedback POST shouldn't disrupt the chat.
    } finally {
      setFeedbackBusy(null);
    }
    // A thumbs-down is exactly the "didn't get help here" signal the triage
    // is built around — offer the same handoff a "talk to a human" message
    // would trigger.
    if (rating === "DOWN") offerHandoff();
  }

  function declineHandoff() {
    setEscalationOffer(false);
    setCollectingEmail(false);
    setEscalationError(null);
  }

  async function submitEscalation(contactEmail?: string) {
    setEscalationSubmitting(true);
    setEscalationError(null);
    try {
      const res = await fetch("/api/assistant/escalate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages,
          contactEmail,
          contactName: session?.user?.name ?? undefined,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setEscalationError(data?.error ?? "Couldn't reach our team — try again in a moment.");
        return;
      }
      setEscalationOffer(false);
      setCollectingEmail(false);
      // Switches straight into live support mode — the next poll tick (or
      // the immediate one the activeEscalationId effect kicks off) picks up
      // the seeded thread, which already contains this whole conversation.
      setActiveEscalationId(data.escalationId as string);
    } catch {
      setEscalationError("Couldn't reach our team — check your connection and try again.");
    } finally {
      setEscalationSubmitting(false);
    }
  }

  function confirmHandoff() {
    if (session?.user) {
      submitEscalation();
    } else {
      setCollectingEmail(true);
      setEscalationError(null);
    }
  }

  function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmedEmail = escalationEmail.trim();
    if (!EMAIL_RE.test(trimmedEmail)) {
      setEscalationError("Enter a valid email address so our team can follow up.");
      return;
    }
    submitEscalation(trimmedEmail);
  }

  // "Done with support, back to normal Q&A" — leaves the thread itself
  // untouched (still there for the admin, still reachable if the visitor
  // sends into it again), just stops routing this widget's composer to it.
  function resetToAtom() {
    setActiveEscalationId(null);
    setThreadMessages([]);
    setThreadStatus(null);
    setMessages([]);
    setError(null);
  }

  if (!mounted) return null;

  const inSupportMode = Boolean(activeEscalationId);
  // Once an admin resolves a thread, it's dead — history stays, but neither
  // Atom nor a real person is listening on it anymore. Guards the composer
  // itself (below), not just the send handler, so there's no window where a
  // stale disabled state lets a message slip through right as it resolves.
  const isResolved = inSupportMode && threadStatus === "RESOLVED";
  // The always-available suggestion row and the handoff micro-flow only
  // make sense before a handoff exists — once a person is (or was)
  // actually connected, there's nothing left to triage.
  const showSuggestions = !inSupportMode && !loading && !escalationOffer && !collectingEmail;
  const hasSupportReply = threadMessages.some((m) => m.sender === "SUPPORT");

  return createPortal(
    <div
      className={`fixed right-6 z-40 flex flex-col items-end gap-3 ${navOverlayOpen ? "hidden" : ""}`}
      style={{ bottom: "calc(6rem + env(safe-area-inset-bottom))" }}
    >
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.96 }}
            transition={{ type: "spring", bounce: 0, duration: 0.3 }}
            // No local `--elev-border`/`--elev-bg` override anymore: Atom
            // used to force its own teal/blue material here regardless of
            // the active site theme, specifically so it wouldn't blend into
            // the rest of the app. Reverted by direct instruction — this
            // panel now reads the same `--elev-border`/`--elev-bg` every
            // other `glass-surface-elevated` on the site does, so it looks
            // like the rest of the app (near-black Ink, or warm Paper),
            // rather than its own thing.
            className="glass-surface-elevated flex h-[min(70vh,560px)] w-[min(92vw,380px)] flex-col overflow-hidden rounded-2xl"
            role="dialog"
            aria-label="Chat with Atom"
          >
            {/* Used to carry a mobile-only teal→blue wash here, echoing the
                icon's old color mix — the icon is signal green now (the
                house accent, not a distinct identity), and green filling
                the whole header would compete with the message bubbles
                below that also use it, so the header stays plain neutral
                at every width instead. */}
            <div className="flex items-center gap-3 border-b border-ink/10 px-4 py-3">
              <div className="h-8 w-8 shrink-0">
                <Loader size={32} />
              </div>
              <div className="min-w-0 flex-1">
                {/* Always "Atom" — per direct instruction, the widget keeps its
                    one identity even once a human joins the thread. Which
                    sender said what is still clear from each message's own
                    ATOM/SUPPORT/YOU label (see ThreadMessageBubble) without
                    the header itself switching names on the visitor. */}
                <p className="text-sm font-semibold text-slate-50">Atom</p>
                <p className="text-xs text-slate-500">Bass Note Piano&apos;s assistant</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close chat"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-ink/5 hover:text-slate-200"
              >
                <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
                  <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            <div className="min-w-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-4">
              {!inSupportMode && messages.length === 0 && (
                <p className="text-sm text-slate-400">
                  Hi, I&apos;m Atom. Ask me about pricing, booking a class, policies, or anything else about Bass Note
                  Piano.
                </p>
              )}

              {!inSupportMode &&
                messages.map((m, i) => (
                  <MessageBubble
                    key={i}
                    message={m}
                    feedback={feedback[i] ?? null}
                    feedbackBusy={feedbackBusy === i}
                    onRate={(rating) => handleRate(i, rating)}
                  />
                ))}

              {inSupportMode && (
                <>
                  {threadMessages.map((m) => (
                    <ThreadMessageBubble key={m.id} message={m} />
                  ))}
                  {!hasSupportReply && threadStatus === "OPEN" && (
                    <p className="rounded-xl border border-ink/10 bg-slate-900/60 p-3 text-center text-xs text-slate-500">
                      You&apos;re connected — our support team has been notified and will reply here shortly.
                    </p>
                  )}
                  {threadStatus === "RESOLVED" && (
                    <div className="space-y-2 rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-3 text-center">
                      <p className="text-xs text-emerald-300">
                        This conversation is closed. The history above is kept, but this thread no longer accepts new
                        messages.
                      </p>
                      <button
                        type="button"
                        onClick={resetToAtom}
                        className="text-xs font-medium text-amber-400 underline-offset-2 hover:underline"
                      >
                        Start a new question with Atom
                      </button>
                    </div>
                  )}
                </>
              )}

              {loading && <TypingIndicator />}
              {error && <p className="text-center text-xs text-red-400">{error}</p>}

              {escalationOffer && (
                <div className="space-y-2 rounded-xl border border-ink/10 bg-slate-900/60 p-3">
                  <p className="text-sm text-slate-300">Want me to connect you with our customer service team? A real person can dig into your account directly.</p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={declineHandoff}
                      disabled={escalationSubmitting}
                      className="flex-1 rounded-lg border border-ink/10 py-1.5 text-xs font-medium text-slate-300 transition hover:bg-slate-800 disabled:opacity-50"
                    >
                      No, keep trying
                    </button>
                    <button
                      type="button"
                      onClick={confirmHandoff}
                      disabled={escalationSubmitting}
                      className="flex flex-1 items-center justify-center rounded-lg bg-amber-400 py-1.5 text-xs font-semibold text-slate-950 transition disabled:opacity-60"
                    >
                      {escalationSubmitting && <MorphingSquare size={12} className="mr-1.5 shrink-0" />}
                      {escalationSubmitting ? "Connecting…" : "Yes, connect me"}
                    </button>
                  </div>
                  {escalationError && <p className="text-xs text-red-400">{escalationError}</p>}
                </div>
              )}

              {collectingEmail && (
                <form onSubmit={handleEmailSubmit} className="space-y-2 rounded-xl border border-ink/10 bg-slate-900/60 p-3">
                  <p className="text-sm text-slate-300">
                    The team will reply right here in this chat — what&apos;s a good email for them to reach you at
                    only if you&apos;re not around when they do?
                  </p>
                  <input
                    type="email"
                    value={escalationEmail}
                    onChange={(e) => setEscalationEmail(e.target.value)}
                    placeholder="you@example.com"
                    autoFocus
                    maxLength={320}
                    disabled={escalationSubmitting}
                    className="w-full rounded-lg border border-ink/10 bg-slate-950 px-3 py-1.5 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-amber-400/40"
                  />
                  {escalationError && <p className="text-xs text-red-400">{escalationError}</p>}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={declineHandoff}
                      disabled={escalationSubmitting}
                      className="flex-1 rounded-lg border border-ink/10 py-1.5 text-xs font-medium text-slate-300 transition hover:bg-slate-800 disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={escalationSubmitting || !escalationEmail.trim()}
                      className="flex flex-1 items-center justify-center rounded-lg bg-amber-400 py-1.5 text-xs font-semibold text-slate-950 transition disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {escalationSubmitting && <MorphingSquare size={12} className="mr-1.5 shrink-0" />}
                      {escalationSubmitting ? "Sending…" : "Notify the team"}
                    </button>
                  </div>
                </form>
              )}

              <div ref={messagesEndRef} />
            </div>

            {showSuggestions && (
              <div className="flex flex-wrap gap-1.5 border-t border-ink/10 px-4 py-2.5">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => sendMessage(s)}
                    disabled={loading}
                    className="rounded-full border border-ink/10 px-2.5 py-1 text-xs text-slate-300 transition hover:border-amber-400/40 hover:text-amber-400 disabled:opacity-50"
                  >
                    {s}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={offerHandoff}
                  disabled={loading}
                  className="rounded-full border border-ink/10 px-2.5 py-1 text-xs text-slate-400 transition hover:border-amber-400/40 hover:text-amber-400 disabled:opacity-50"
                >
                  Talk to our team
                </button>
              </div>
            )}

            <form onSubmit={handleSubmit} className="flex min-w-0 gap-2 border-t border-ink/10 p-3">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={isResolved ? "This conversation is closed" : inSupportMode ? "Message support…" : "Ask Atom anything…"}
                maxLength={2000}
                disabled={loading || isResolved}
                className="min-w-0 flex-1 rounded-xl border border-ink/10 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-amber-400/40 disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={loading || isResolved || !input.trim()}
                aria-label={loading ? "Sending…" : "Send"}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-400 text-slate-950 transition disabled:opacity-40"
              >
                {loading ? (
                  <MorphingSquare size={16} />
                ) : (
                  <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
                    <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showGreeting && !open && (
          // A <button> (the bubble, opens the panel) used to have another
          // interactive element (the dismiss control) nested inside it —
          // invalid HTML regardless of whether that inner control is a real
          // <button> or (as it was) a role="button" span, and genuinely
          // ambiguous for a screen reader or keyboard user, not just a
          // technicality. Two sibling buttons inside a plain wrapping div
          // instead: open and dismiss are both real, independently
          // reachable controls, neither nested in the other.
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ type: "spring", bounce: 0, duration: 0.3 }}
            // Same reasoning as the open panel above: no local
            // `--elev-border`/`--elev-bg` override anymore, so this greeting
            // bubble reads the same elevated-glass material every other
            // `glass-surface-elevated` on the site does.
            className="glass-surface-elevated relative max-w-[240px] rounded-2xl text-sm leading-relaxed text-slate-100"
          >
            <button type="button" onClick={openPanel} className="block w-full rounded-2xl px-4 py-3 text-left">
              {GREETING_TEXT}
            </button>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={dismissGreeting}
              className="absolute -right-2 -top-2 flex h-6 w-6 cursor-pointer items-center justify-center rounded-full border border-ink/10 bg-slate-950 text-slate-400 transition hover:text-slate-200"
            >
              <svg viewBox="0 0 24 24" fill="none" className="h-3 w-3">
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {!open && <AtomButton onClick={openPanel} label="Chat with Atom, your personal assistant" />}
    </div>,
    document.body,
  );
}

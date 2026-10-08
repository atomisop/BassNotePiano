"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { AnimatePresence, motion } from "framer-motion";
import GenerateAIButton, { AI_HALO, AiBorder } from "@/components/ui/button-33";
import { MessageBubble as IdeaBubble } from "@/components/ui/message-bubble";
import { ArrowRight, Lightbulb, Sparkles } from "lucide-react";
import { MorphingSquare } from "@/components/ui/morphing-square";
import { RegionError } from "@/components/ui/RegionError";
import { usePoll } from "@/hooks/usePoll";
import { readConsent, CONSENT_DECIDED_EVENT } from "@/lib/cookieConsent";
import { FULLSCREEN_NAV_EVENT, setAtomPanelOpen } from "@/lib/overlayNav";
import { ATOM_TRIGGER_EVENT, OPEN_ATOM_CASE_EVENT, OPEN_ATOM_EVENT, isAtomTriggerPresent } from "@/lib/atomTrigger";
import { SPRING } from "@/lib/motionTokens";

/**
 * Atom, the "ask me anything" assistant, floating on every page (mounted
 * once in providers.tsx, same pattern as Toaster/CookieConsentBanner).
 *
 * The launcher (and the open panel's header icon, and every per-message
 * accent) run `AiBorder`/`GenerateAIButton` from `components/ui/button-33.tsx`,
 * a signal-green animated gradient ring. Atom used to run its own distinct
 * color identity here (`components/ui/loader-15.tsx`'s pink/orange gradient
 * first, since deleted, then teal/blue, see themes.css's own "Accent"
 * comment), on the theory it should read as its own character rather than
 * blend into the app's chrome. Reverted by direct instruction: Atom now
 * matches the app exactly, everywhere below, including the signal green
 * that's the house accent again, no separate identity anymore. This whole
 * lineage replaced an original `PulsingBorder` WebGL shader treatment:
 * that version needed its own feature-detection-and-fallback machinery (a
 * shader canvas that *throws*, not warns, on a device with no WebGL, real
 * production error-monitoring events showed visitors on locked-down/older
 * hardware hitting a broken widget from it). Everything since is plain
 * SVG/CSS, so none of that applies, there's no fallback branch because
 * there's nothing left that can fail that way.
 *
 * MOBILE OVERLAY SUPPRESSION: the launcher is portaled straight to
 * `document.body` at `z-40`, same as MarketingNav's mobile menu and the
 * dashboard's MoreSheet (`z-50`, also body-portaled). That numeric gap
 * should keep Atom behind either one, but a visitor reported seeing the
 * launcher float on top of the open mobile menu regardless, see
 * `lib/overlayNav.ts` for why this doesn't just trust the z-index. Both
 * overlays broadcast `FULLSCREEN_NAV_EVENT` while open; this widget listens
 * and hides itself (`navOverlayOpen` below) for as long as one is up.
 *
 * COOKIE BANNER COLLISION, the same problem running the other way: the
 * open chat panel is itself a `fixed`, body-portaled element claiming the
 * same corner of the screen CookieConsentBanner does (`z-[70]`), which had
 * no idea this panel existed and rendered on top of it, confirmed live
 * (a first visitor opening Atom before deciding on cookies got the banner
 * sitting over the bottom of the open panel). Fixed from this side too,
 * broadcasting `ATOM_PANEL_OPEN_EVENT` whenever `open` changes so the
 * banner can step aside while this is up, same `lib/overlayNav.ts`.
 *
 * Positioned at bottom-24 (not bottom-6, where ScrollToTopButton and the
 * marketing pages' footer live) specifically to clear that button and the
 * signed-in AppDock, which is centered but still close to the bottom edge.
 *
 * That 96px is a plain fixed value, though, and AppDock's own bottom offset
 * isn't: AppDock adds `pb-[env(safe-area-inset-bottom)]` on top of its
 * `bottom-4`, so on a real notched/Dynamic-Island iPhone (a ~34px inset)
 * the dock's whole row shifts up by that same amount while this launcher,
 * reading no such inset, stays put, eating most of the ~20px clearance the
 * fixed 96px was sized around and letting the launcher dip down over
 * whatever dock icon sits beneath it (reported as "the text is cut out,"
 * a dock label rendering underneath Atom's loader ring). `env(...)`
 * resolves to 0 on anything without a safe area (desktop, older phones),
 * so this changes nothing there, it only restores the original ~20px gap
 * on devices where AppDock itself already moved.
 *
 * Also owns several self-contained additions layered on top of the plain
 * chat, none of which touch the LLM prompt itself:
 *  - a thumbs up/down under every Atom reply (POSTs to /api/assistant/feedback);
 *  - a suggestion-chip row that's always available before a handoff;
 *  - a small, deterministic (non-LLM) triage: a thumbs-down or an "I need a
 *    human" kind of message offers a handoff, which, once confirmed,
 *    POSTs the transcript to /api/assistant/escalate. From there the widget
 *    switches into live "support mode": the composer talks to
 *    /api/assistant/support/[id] instead of the LLM, polling the same
 *    endpoint for whatever an admin replies with from /admin/support. A
 *    support reply always renders labeled "Support", never the admin's
 *    real name, which the visitor-facing API never even returns.
 */

const GREETING_TEXT = "Hi I am Atom, your personal assistant. Ask me anything related to Bass Note Piano";
const GREETING_SEEN_KEY = "bnp-atom-greeting-seen";
const FEEDBACK_KEY = "bnp-atom-feedback";
const ESCALATION_ID_KEY = "bnp-atom-escalation-id";
const GREETING_DELAY_MS = 1800;
const GREETING_VISIBLE_MS = 9000;

// Local fallback copy of the dismissal count (the real count lives on the
// server: a one-year device cookie plus the account, see
// /api/assistant/greeting). Mirrors ATOM_GREETING_DISMISS_LIMIT in
// src/lib/assistant.ts. localStorage, not sessionStorage: it needs to
// survive closing the tab, unlike GREETING_SEEN_KEY above.
const ANONYMOUS_GREETING_DISMISS_KEY = "bnp-atom-greeting-dismiss-count";
const ANONYMOUS_GREETING_DISMISS_LIMIT = 3;
const SUPPORT_POLL_MS = 2500;

const SUGGESTIONS = [
  "How much does the curriculum cost?",
  "How do I book a class?",
  "What's the refund policy?",
  "I need help with my account",
];

// Simple, deterministic triage, no reliance on the model to self-report
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

function readAnonymousGreetingDismissCount(): number {
  if (typeof window === "undefined") return 0;
  try {
    return Number(window.localStorage.getItem(ANONYMOUS_GREETING_DISMISS_KEY)) || 0;
  } catch {
    return 0;
  }
}

function AtomButton({ onClick, label }: { onClick: () => void; label: string }) {
  return <GenerateAIButton calm label="Ask AI" ariaLabel={label} onClick={onClick} />;
}

// Deliberately tiny and low-contrast, a CSAT prompt that competed
// visually with the actual answer would be worse than no CSAT prompt at
// all. Rating stays changeable (clicking the other icon switches it,
// clicking the already-selected one is a no-op) rather than locking in
// after the first click, a visitor who mis-tapped, or who changes their
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
      <span className="text-small text-slate-600">Was this answer satisfying?</span>
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
// link syntax (the system prompt writes "/messages" etc. as real paths),
// this turns [label](url) into an actual clickable link instead of showing
// the bracket/paren syntax as literal text. Deliberately minimal: this is
// the only markdown construct the model is asked to use, so a full markdown
// renderer would be solving a problem that doesn't exist here. Shared by
// both bubble components below since a seeded transcript message can appear
// in either one (pre-handoff in MessageBubble, replayed inside the thread
// in ThreadMessageBubble).
const MARKDOWN_LINK = /\[([^\]]+)\]\(([^)]+)\)/g;

// Atom is only ever instructed (see the system prompt in assistant.ts) to
// link to real in-app paths like "/pricing", so every legitimate href is a
// same-origin, root-relative path. Guarding this explicitly rather than
// trusting that shape blindly: content.matchAll above is scanning text this
// app doesn't fully control (a model reply can, in principle, be steered by
// adversarial visitor input, or simply hallucinate), and without this check
// a href of e.g. "javascript:..." would be handed straight to next/link's
// underlying <a>, which, unlike React text content, the browser will
// actually execute on click. A leading "/" alone isn't enough: browsers
// read "//host", "/\host", and "/<tab>/host" as off-site links, so the href
// is resolved the same way a browser would and must stay on our own origin.
const IN_APP_ORIGIN = "https://in-app.invalid";

function isSafeInAppHref(href: string): boolean {
  if (!href.startsWith("/")) return false;
  try {
    return new URL(href, IN_APP_ORIGIN).origin === IN_APP_ORIGIN;
  } catch {
    return false;
  }
}

function renderMessageContent(content: string, accentLink: boolean) {
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;

  for (const match of Array.from(content.matchAll(MARKDOWN_LINK))) {
    const [full, label, href] = match;
    const index = match.index ?? 0;
    if (index > lastIndex) parts.push(<Fragment key={key++}>{content.slice(lastIndex, index)}</Fragment>);
    if (isSafeInAppHref(href)) {
      parts.push(
        <Link
          key={key++}
          href={href}
          className={`underline underline-offset-2 ${accentLink ? "text-primary" : "text-amber-400 hover:opacity-70"}`}
        >
          {label}
        </Link>,
      );
    } else {
      // Not a real in-app path, so it falls back to plain text instead of a
      // navigable/clickable href. A well-behaved reply never hits this;
      // it's the backstop for one that isn't.
      parts.push(<Fragment key={key++}>{label}</Fragment>);
    }
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
    <div data-atom-msg={isMine ? "user" : "assistant"} className={`scroll-mt-4 flex flex-col ${isMine ? "items-end" : "items-start"}`}>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={SPRING.smooth}
        className={`relative max-w-[80%] overflow-hidden rounded-2xl px-3.5 py-2 text-body text-primary ${isMine ? "" : "shadow-raised-low"}`}
        style={isMine ? { boxShadow: `var(--neu-raised-low), ${AI_HALO}` } : undefined}
      >
        <AiBorder rounded="rounded-2xl" spin={false} glow={isMine} spinClass="size-[600px]" surface="bg-neu-base" />
        <p className="relative z-10 whitespace-pre-wrap break-words">{renderMessageContent(message.content, isMine)}</p>
      </motion.div>
      {!isMine && <FeedbackButtons rating={feedback} busy={feedbackBusy} onRate={onRate} />}
    </div>
  );
}

// Post-handoff rendering, every bubble here carries an explicit sender
// label (never ambiguous the way a plain LLM reply is), and SUPPORT gets
// its own accent so "a real person just replied" reads at a glance rather
// than blending into Atom's own messages.
function ThreadMessageBubble({ message }: { message: ThreadMessage }) {
  const isVisitor = message.sender === "VISITOR";
  return (
    <div className={`flex flex-col ${isVisitor ? "items-end" : "items-start"}`}>
      <span className="mb-1 px-1 text-small uppercase tracking-wide text-slate-600">{THREAD_SENDER_LABEL[message.sender]}</span>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={SPRING.smooth}
        className={`relative max-w-[80%] overflow-hidden rounded-2xl px-3.5 py-2 text-body text-primary ${isVisitor ? "" : "shadow-raised-low"}`}
        style={isVisitor ? { boxShadow: `var(--neu-raised-low), ${AI_HALO}` } : undefined}
      >
        <AiBorder
          rounded="rounded-2xl"
          spin={message.sender === "SUPPORT"}
          glow={isVisitor}
          spinClass="size-[600px]"
          surface="bg-neu-base"
        />
        <p className="relative z-10 whitespace-pre-wrap break-words">{renderMessageContent(message.body, isVisitor)}</p>
      </motion.div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex justify-start">
      <div className="relative flex items-center gap-1 overflow-hidden rounded-full px-4 py-3 shadow-raised-low">
        <AiBorder surface="bg-neu-base" />
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="relative z-10 h-1.5 w-1.5 rounded-full bg-primary"
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
  // Model-predicted follow-ups for the chips; empty until the first answer
  // lands (the built-in SUGGESTIONS cover the empty chat).
  const [generatedSuggestions, setGeneratedSuggestions] = useState<string[]>([]);
  // Whether the greeting bubble has been explicitly dismissed enough times
  // (see dismissGreeting) that it should never be offered again. Checked
  // once mounted, server-side for a signed-in account or from this
  // browser's own localStorage otherwise (see the effect below).
  const [greetingSuppressed, setGreetingSuppressed] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Feedback (thumbs), keyed by index into `messages`, which never
  // reorders/truncates client-side, so the index stays a stable key for the
  // lifetime of one stored history.
  const [feedback, setFeedback] = useState<Record<number, FeedbackRating>>({});
  const [feedbackBusy, setFeedbackBusy] = useState<number | null>(null);

  // Triage/handoff offer, entirely client-side state, never sent anywhere
  // until the visitor explicitly confirms they want a person.
  const [escalationOffer, setEscalationOffer] = useState(false);
  const [collectingEmail, setCollectingEmail] = useState(false);
  const [escalationEmail, setEscalationEmail] = useState("");
  const [escalationSubmitting, setEscalationSubmitting] = useState(false);
  const [escalationError, setEscalationError] = useState<string | null>(null);

  // Live support mode, once set, the composer talks to the support thread
  // instead of the LLM, and threadMessages (fetched/polled from the server)
  // replaces `messages` as the render source.
  const [activeEscalationId, setActiveEscalationId] = useState<string | null>(null);
  const [threadMessages, setThreadMessages] = useState<ThreadMessage[]>([]);
  const [threadStatus, setThreadStatus] = useState<ThreadStatus | null>(null);
  const [supportTyping, setSupportTyping] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);

  // See lib/overlayNav.ts, true while MarketingNav's mobile menu or the
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

  // Tells CookieConsentBanner (a separate fixed, body-portaled element
  // claiming the same corner of the screen) to hold itself back while this
  // panel is open, see overlayNav.ts.
  useEffect(() => {
    setAtomPanelOpen(open);
    return () => setAtomPanelOpen(false);
  }, [open]);

  // The dashboard TopBar's "Ask AI" button (see lib/atomTrigger.ts) replaces
  // the floating launcher and greeting bubble while it is mounted, and opens
  // this panel on click.
  const [hasTopBarTrigger, setHasTopBarTrigger] = useState(false);
  useEffect(() => {
    setHasTopBarTrigger(isAtomTriggerPresent());
    function onTrigger(e: Event) {
      setHasTopBarTrigger(Boolean((e as CustomEvent<boolean>).detail));
    }
    function onOpen() {
      openPanelRef.current();
    }
    window.addEventListener(ATOM_TRIGGER_EVENT, onTrigger);
    window.addEventListener(OPEN_ATOM_EVENT, onOpen);
    return () => {
      window.removeEventListener(ATOM_TRIGGER_EVENT, onTrigger);
      window.removeEventListener(OPEN_ATOM_EVENT, onOpen);
    };
  }, []);
  const openPanelRef = useRef<() => void>(() => {});

  // A support case opened from Mail: switch to that live thread and show the panel.
  useEffect(() => {
    function onCase(e: Event) {
      const id = (e as CustomEvent<string>).detail;
      if (typeof id !== "string" || !id) return;
      setActiveEscalationId(id);
      openPanelRef.current();
    }
    window.addEventListener(OPEN_ATOM_CASE_EVENT, onCase);
    return () => window.removeEventListener(OPEN_ATOM_CASE_EVENT, onCase);
  }, []);

  // Where the top-bar Ask AI button sits, so the greeting bubble can hang right
  // under it like a thought. Re-measured on resize and whenever the bubble is
  // about to show (the nav can reflow between breakpoints).
  const [triggerAnchor, setTriggerAnchor] = useState<{ top: number; right: number; width: number } | null>(null);
  useEffect(() => {
    if (!hasTopBarTrigger) {
      setTriggerAnchor(null);
      return;
    }
    function measure() {
      const el = document.querySelector<HTMLElement>("[data-atom-trigger]");
      if (!el) return setTriggerAnchor(null);
      const r = el.getBoundingClientRect();
      if (r.width === 0) return setTriggerAnchor(null);
      setTriggerAnchor({ top: r.bottom, right: window.innerWidth - r.right, width: r.width });
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [hasTopBarTrigger, showGreeting]);

  // Portals need a real document, same SSR-safety pattern as NotificationBell.
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
      // Non-fatal, worst case a reload loses the live thread and the
      // widget falls back to plain Atom chat.
    }
  }, [activeEscalationId, mounted]);

  // sessionStorage clears on tab close, so a signed-in visitor who closes
  // and reopens the tab would otherwise lose their live thread entirely,
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
        // Best-effort, worst case they just stay in plain Atom chat.
      });
    return () => {
      cancelled = true;
    };
  }, [mounted, session?.user?.id, activeEscalationId]);

  // In a live thread the team sees "Customer is typing" for as long as the box is focused:
  // refreshed every 2 seconds, and stopped at once when it loses focus or the panel closes.
  useEffect(() => {
    if (!activeEscalationId || !inputFocused || !open) return;
    const send = (typing: boolean) =>
      void fetch(`/api/assistant/support/${activeEscalationId}/typing`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ typing }),
      }).catch(() => {});
    send(true);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") send(true);
    }, 2_000);
    return () => {
      window.clearInterval(timer);
      send(false);
    };
  }, [activeEscalationId, inputFocused, open]);

  // Polls the live thread while it's open on screen, no point spending
  // requests on a panel the visitor isn't looking at.
  const threadPoll = usePoll(
    async (signal) => {
      const res = await fetch(`/api/assistant/support/${activeEscalationId}`, { signal });
      // A 4xx (thread gone, not yours) is an answer, not an outage: stay
      // quiet and let the existing closed-thread handling deal with it. Only
      // a server error or a dropped connection counts as a failed tick.
      if (res.status >= 500) throw new Error("support poll failed");
      if (!res.ok) return;
      const data = await res.json();
      if (signal.aborted) return;
      setThreadMessages(data.messages);
      setThreadStatus(data.status);
      setSupportTyping(Boolean(data.supportTyping));
    },
    SUPPORT_POLL_MS,
    { enabled: Boolean(activeEscalationId && open), resetKey: activeEscalationId },
  );

  // Whether the greeting has been explicitly canceled enough times to stop
  // offering it at all. A signed-in account persists this server-side (so
  // it holds across devices); an anonymous visitor only has this browser's
  // own localStorage. Depends on session?.user?.id rather than just
  // `mounted` since useSession() itself resolves a moment after mount; the
  // brief window where that's still unsettled just reads the (harmless,
  // usually-false) localStorage branch until it re-runs against the real
  // session, well before GREETING_DELAY_MS could ever show the bubble.
  //
  // The server answers for both cases now (a one-year device cookie plus the
  // account when signed in; see /api/assistant/greeting), so the count no
  // longer resets when Safari clears page storage or when someone signs in.
  // The old localStorage counter still counts, so nobody who already
  // dismissed it three times sees it come back after this change.
  useEffect(() => {
    if (!mounted) return;
    if (readAnonymousGreetingDismissCount() >= ANONYMOUS_GREETING_DISMISS_LIMIT) {
      setGreetingSuppressed(true);
      return;
    }
    fetch("/api/assistant/greeting")
      .then((res) => res.json())
      .then((data) => setGreetingSuppressed(Boolean(data?.suppressed)))
      .catch(() => {
        // Best-effort: worst case the greeting shows once more than it should.
      });
  }, [mounted, session?.user?.id]);

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
    if (!mounted || messages.length > 0 || greetingSuppressed) return;
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
  }, [mounted, messages.length, greetingSuppressed]);

  // The bubble introduces itself, then gets out of the way on its own so it
  // never sits on top of page content for long.
  useEffect(() => {
    if (!showGreeting) return;
    const timer = setTimeout(() => hideGreetingForSession(), GREETING_VISIBLE_MS);
    return () => clearTimeout(timer);
    // hideGreetingForSession only touches state setters and sessionStorage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showGreeting]);

  // Hides the bubble for the rest of this tab's session regardless of how
  // that happened. Opening the chat (openPanel) counts just as much as an
  // explicit cancel here; neither should keep re-pitching the same tab.
  function hideGreetingForSession() {
    setShowGreeting(false);
    try {
      window.sessionStorage.setItem(GREETING_SEEN_KEY, "1");
    } catch {
      // Non-fatal: worst case the greeting reappears once more.
    }
  }

  /**
   * The bubble's own explicit dismiss (X) control specifically, distinct
   * from opening the chat (openPanel), which also hides the bubble for this
   * tab but isn't "canceling" it: using Atom is already a stronger signal
   * than closing an unread pitch, so it doesn't count toward the limit.
   * Persisted server-side for a signed-in account (so the cap holds across
   * every device, not just this browser); an anonymous visitor has no
   * account for that, so this browser's own localStorage stands in.
   */
  function dismissGreeting() {
    hideGreetingForSession();
    // Counted on the server for everyone (device cookie, plus the account
    // when signed in). localStorage keeps a local copy as a fallback.
    try {
      const next = readAnonymousGreetingDismissCount() + 1;
      window.localStorage.setItem(ANONYMOUS_GREETING_DISMISS_KEY, String(next));
      if (next >= ANONYMOUS_GREETING_DISMISS_LIMIT) setGreetingSuppressed(true);
    } catch {
      // Non-fatal: the server count below still applies.
    }
    fetch("/api/assistant/greeting", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })
      .then((res) => res.json())
      .then((data) => {
        if (data?.suppressed) setGreetingSuppressed(true);
      })
      .catch(() => {
        // Best-effort: worst case this dismissal just doesn't count server-side.
      });
  }

  function openPanel() {
    hideGreetingForSession();
    setOpen(true);
    setTimeout(() => inputRef.current?.focus(), 250);
  }

  openPanelRef.current = openPanel;

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open]);

  // overscroll-contain on the message list (below) stops wheel/trackpad
  // scroll from chaining to the page once the list hits its own top/bottom,
  // but that CSS property is unreliable for touch scrolling on iOS
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

  // Once Atom has answered, bring the TOP of that answer into view so it can be
  // read from the start (the suggestion chips sit below it in the same scroll
  // list). Every other change (typing dots, handoff forms, support thread)
  // still follows the bottom.
  useEffect(() => {
    const list = messagesEndRef.current?.parentElement;
    const answers = list?.querySelectorAll<HTMLElement>('[data-atom-msg="assistant"]');
    const lastAnswer = answers && answers.length > 0 ? answers[answers.length - 1] : null;
    const answeredJustNow = !loading && !activeEscalationId && messages[messages.length - 1]?.role === "assistant";
    if (answeredJustNow && lastAnswer) lastAnswer.scrollIntoView({ behavior: "smooth", block: "start" });
    else messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, threadMessages, loading, escalationOffer, collectingEmail, activeEscalationId]);

  // Asks the model what the visitor will probably want next. Best-effort: on
  // any failure the chips just fall back to the built-in list.
  async function refreshSuggestions(history: Message[]) {
    try {
      const res = await fetch("/api/assistant/suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }),
      });
      const data = await res.json().catch(() => null);
      if (Array.isArray(data?.suggestions) && data.suggestions.length > 0) {
        setGeneratedSuggestions(data.suggestions.filter((q: unknown): q is string => typeof q === "string"));
      }
    } catch {
      // Non-blocking.
    }
  }

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
        setError(data?.error ?? "Something went wrong. Try again in a moment.");
        // Atom could not answer at all (not a one-off hiccup): put a person one tap away.
        if (data?.code === "atom_unavailable") offerHandoff();
        return;
      }

      setMessages([...nextHistory, { role: "assistant", content: data.reply as string }]);
      // A plain-English ask for a human is offered a handoff regardless of
      // how the reply itself reads, this check is on what the visitor
      // typed, not on anything the model said.
      if (HUMAN_REQUEST_RE.test(trimmed)) offerHandoff();
      void refreshSuggestions([...nextHistory, { role: "assistant", content: data.reply as string }]);
    } catch {
      setError("Couldn't reach Atom. Check your connection and try again.");
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
        setError(data?.error ?? "Something went wrong sending that. Try again in a moment.");
        return;
      }
      setThreadMessages(data.messages);
      setThreadStatus(data.status);
      setSupportTyping(Boolean(data.supportTyping));
    } catch {
      setError("Couldn't send that. Check your connection and try again.");
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
      // Best-effort, a failed feedback POST shouldn't disrupt the chat.
    } finally {
      setFeedbackBusy(null);
    }
    // A thumbs-down is exactly the "didn't get help here" signal the triage
    // is built around, offer the same handoff a "talk to a human" message
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
        setEscalationError(data?.error ?? "Couldn't reach our team. Try again in a moment.");
        return;
      }
      setEscalationOffer(false);
      setCollectingEmail(false);
      // Switches straight into live support mode, the next poll tick (or
      // the immediate one the activeEscalationId effect kicks off) picks up
      // the seeded thread, which already contains this whole conversation.
      setActiveEscalationId(data.escalationId as string);
    } catch {
      setEscalationError("Couldn't reach our team. Check your connection and try again.");
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

  // "Done with support, back to normal Q&A", leaves the thread itself
  // untouched (still there for the admin, still reachable if the visitor
  // sends into it again), just stops routing this widget's composer to it.
  //
  // Also clears `feedback`/`feedbackBusy`, not just `messages`: `feedback`
  // is keyed by index into `messages` (see its own declaration comment,
  // "messages never reorders/truncates client-side, so the index stays a
  // stable key"), an invariant this function itself was the one place that
  // broke it. Resetting `messages` back to [] without also resetting
  // `feedback` left old index -> rating entries in place, so a fresh
  // question asked after a resolved support thread could land its reply at
  // the same index a *previous* conversation's message had been rated at
  // and immediately show that stale thumbs-up/down on a reply the visitor
  // never actually rated.
  function resetToAtom() {
    setActiveEscalationId(null);
    setThreadMessages([]);
    setThreadStatus(null);
    setMessages([]);
    setFeedback({});
    setFeedbackBusy(null);
    setError(null);
  }

  if (!mounted) return null;

  const inSupportMode = Boolean(activeEscalationId);
  // Once an admin resolves a thread, it's dead, history stays, but neither
  // Atom nor a real person is listening on it anymore. Guards the composer
  // itself (below), not just the send handler, so there's no window where a
  // stale disabled state lets a message slip through right as it resolves.
  const isResolved = inSupportMode && threadStatus === "RESOLVED";
  // The always-available suggestion row and the handoff micro-flow only
  // make sense before a handoff exists, once a person is (or was)
  // actually connected, there's nothing left to triage.
  const showSuggestions = !inSupportMode && !loading && !escalationOffer && !collectingEmail;
  // Never offer a question the visitor already asked (tapped or typed): it is
  // already answered above.
  const normalizeQuestion = (q: string) => q.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
  const askedQuestions = new Set(messages.filter((m) => m.role === "user").map((m) => normalizeQuestion(m.content)));
  const visibleSuggestions = (generatedSuggestions.length > 0 ? generatedSuggestions : SUGGESTIONS).filter(
    (q) => !askedQuestions.has(normalizeQuestion(q)),
  );
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
            transition={SPRING.snappy}
            // No local `--elev-border`/`--elev-bg` override anymore: Atom
            // used to force its own teal/blue material here regardless of
            // the active site theme, specifically so it wouldn't blend into
            // the rest of the app. Reverted by direct instruction, this
            // panel now reads the same `--elev-border`/`--elev-bg` every
            // other `glass-surface-elevated` on the site does, so it looks
            // like the rest of the app (near-black Ink, or warm Paper),
            // rather than its own thing.
            className="relative h-[min(70vh,560px)] w-[min(92vw,380px)] overflow-hidden rounded-3xl text-primary"
            style={{ boxShadow: `var(--neu-raised-high), ${AI_HALO}` }}
            role="dialog"
            aria-label="Chat with Atom"
            // Lenis (marketing smooth scroll) hijacks wheel events window-wide;
            // this tells it to leave scrolling inside the panel alone.
            data-lenis-prevent
          >
            <AiBorder rounded="rounded-3xl" glow surface="bg-neu-base" />
            <div className="relative z-10 flex h-full min-w-0 flex-col">
            {/* Used to carry a mobile-only teal→blue wash here, echoing the
                icon's old color mix, the icon is signal green now (the
                house accent, not a distinct identity), and green filling
                the whole header would compete with the message bubbles
                below that also use it, so the header stays plain neutral
                at every width instead. */}
            <div className="flex items-center gap-3 border-b border-border px-4 py-3">
              <Sparkles className="size-6 shrink-0 text-primary" fill="currentColor" />
              <div className="min-w-0 flex-1">
                {/* Always "Atom", per direct instruction, the widget keeps its
                    one identity even once a human joins the thread. Which
                    sender said what is still clear from each message's own
                    ATOM/SUPPORT/YOU label (see ThreadMessageBubble) without
                    the header itself switching names on the visitor. */}
                <p className="text-small font-semibold text-primary">Atom</p>
                <p className="text-small text-slate-500">Bass Note Piano&apos;s assistant</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close chat"
                className="tap flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-primary transition hover:bg-border/40"
              >
                <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
                  <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            <div data-lenis-prevent className="min-w-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-4">
              {!inSupportMode && messages.length === 0 && (
                <p className="text-small text-slate-400">
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
                  {supportTyping && threadStatus === "OPEN" && (
                    <div className="flex items-center gap-2 px-1 text-small text-slate-500" aria-live="polite">
                      Support is typing <TypingIndicator />
                    </div>
                  )}
                  {!hasSupportReply && threadStatus === "OPEN" && !supportTyping && (
                    <p className="rounded-2xl bg-neu-base p-3 shadow-raised-low text-center text-small text-slate-500">
                      You&apos;re connected. Our support team has been notified and will reply here shortly.
                    </p>
                  )}
                  {threadPoll.failed && (
                    <RegionError
                      title="Can't reach support right now."
                      detail="Your messages are safe. We'll keep trying."
                      onRetry={threadPoll.retry}
                    />
                  )}
                  {threadStatus === "RESOLVED" && (
                    <div className="space-y-2 rounded-2xl bg-neu-base p-3 shadow-raised-low text-center">
                      <p className="text-small text-slate-100">
                        This conversation is closed. The history above is kept, but this thread no longer accepts new
                        messages.
                      </p>
                      <button
                        type="button"
                        onClick={resetToAtom}
                        className="text-small font-medium text-amber-400 underline-offset-2 hover:underline"
                      >
                        Start a new question with Atom
                      </button>
                    </div>
                  )}
                </>
              )}

              {loading && <TypingIndicator />}
              {error && <p className="text-center text-small text-red-400">{error}</p>}

              {escalationOffer && (
                <div className="space-y-2 rounded-2xl bg-neu-base p-3 shadow-raised-low">
                  <p className="text-small text-slate-300">Want me to connect you with our customer service team? A real person can dig into your account directly.</p>
                  <div className="flex gap-2">
                    <GenerateAIButton icon={false} onClick={declineHandoff} disabled={escalationSubmitting} surface="bg-neu-base" className="h-9 flex-1 px-3 text-small shadow-raised-low">
                      No, keep trying
                    </GenerateAIButton>
                    <GenerateAIButton onClick={confirmHandoff} disabled={escalationSubmitting} surface="bg-neu-base" className="h-9 flex-1 px-3 text-small shadow-raised-low">
                      {escalationSubmitting && <MorphingSquare size={12} className="shrink-0" />}
                      {escalationSubmitting ? "Connecting…" : "Yes, connect me"}
                    </GenerateAIButton>
                  </div>
                  {escalationError && <p className="text-small text-red-400">{escalationError}</p>}
                </div>
              )}

              {collectingEmail && (
                <form onSubmit={handleEmailSubmit} className="space-y-2 rounded-2xl bg-neu-base p-3 shadow-raised-low">
                  <p className="text-small text-slate-300">
                    The team will reply right here in this chat. What&apos;s a good email for them to reach you at
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
                    className="w-full rounded-full bg-neu-base px-4 py-1.5 text-body text-primary shadow-pressed-low outline-none transition placeholder:text-slate-500"
                  />
                  {escalationError && <p className="text-small text-red-400">{escalationError}</p>}
                  <div className="flex gap-2">
                    <GenerateAIButton icon={false} onClick={declineHandoff} disabled={escalationSubmitting} surface="bg-neu-base" className="h-9 flex-1 px-3 text-small shadow-raised-low">
                      Cancel
                    </GenerateAIButton>
                    <GenerateAIButton
                      type="submit"
                      disabled={escalationSubmitting || !escalationEmail.trim()}
                      surface="bg-neu-base" className="h-9 flex-1 px-3 text-small shadow-raised-low"
                    >
                      {escalationSubmitting && <MorphingSquare size={12} className="shrink-0" />}
                      {escalationSubmitting ? "Sending…" : "Notify the team"}
                    </GenerateAIButton>
                  </div>
                </form>
              )}

            {showSuggestions && (
              <div className="flex flex-wrap gap-2 pt-1">
                {visibleSuggestions.map((s) => (
                  <GenerateAIButton
                    key={s}
                    icon={false}
                    glow
                    surface="bg-neu-base"
                    onClick={() => sendMessage(s)}
                    disabled={loading}
                    className="h-8 px-3 text-small"
                  >
                    {s}
                  </GenerateAIButton>
                ))}
                <GenerateAIButton
                  icon={false}
                  glow
                  surface="bg-neu-base"
                  onClick={offerHandoff}
                  disabled={loading}
                  className="h-8 px-3 text-small"
                >
                  Talk to our team
                </GenerateAIButton>
              </div>
            )}
              <div ref={messagesEndRef} />
            </div>

            <form onSubmit={handleSubmit} className="flex min-w-0 items-center gap-2 border-t border-border p-3">
              <div
                className="relative min-w-0 flex-1 overflow-hidden rounded-full"
                style={{ boxShadow: `var(--neu-pressed-low), ${AI_HALO}` }}
              >
                <AiBorder glow surface="bg-neu-base" />
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onFocus={() => setInputFocused(true)}
                  onBlur={() => setInputFocused(false)}
                  placeholder={isResolved ? "This conversation is closed" : inSupportMode ? "Message support…" : "Ask Atom anything…"}
                  maxLength={2000}
                  disabled={loading || isResolved}
                  className="relative z-10 w-full min-w-0 bg-transparent px-4 py-2 text-body text-primary outline-none placeholder:text-slate-500 disabled:opacity-50"
                />
              </div>
              <GenerateAIButton
                type="submit"
                disabled={loading || isResolved || !input.trim()}
                ariaLabel={loading ? "Sending…" : "Send"}
                icon={false}
                glow={input.trim().length > 0}
                plain={input.trim().length === 0}
                surface="bg-neu-base"
                className="size-10 shrink-0 px-0 shadow-raised-low"
              >
                {loading ? <MorphingSquare size={16} /> : <ArrowRight className="size-4" />}
              </GenerateAIButton>
            </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* The "I have an idea" greeting: a thought bubble hanging under the top-bar
          Ask AI button, with the little trail of circles a thought bubble has
          rising toward it. Same Atom look as everything else (glowing border,
          neumorphic fill). The three-dismissals-and-it-never-returns rule is the
          existing one, in dismissGreeting/greetingSuppressed. */}
      <AnimatePresence>
        {showGreeting && !open && hasTopBarTrigger && triggerAnchor && (
          <motion.div
            key="idea-bubble"
            initial={{ opacity: 0, y: -8, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.92 }}
            transition={SPRING.lively}
            style={{
              position: "fixed",
              top: triggerAnchor.top + 26,
              right: Math.max(12, Math.min(triggerAnchor.right, 40)),
              width: "min(268px, calc(100vw - 24px))",
              transformOrigin: "top right",
            }}
            className="z-[46]"
          >
            {/* Thought trail: small, then bigger, rising to the button. */}
            <span
              aria-hidden
              className="absolute rounded-full bg-neu-base ring-[1.5px] ring-amber-400/70 shadow-raised-low"
              style={{ width: 8, height: 8, top: -24, right: triggerAnchor.right + triggerAnchor.width / 2 - Math.max(12, Math.min(triggerAnchor.right, 40)) - 4 }}
            />
            <span
              aria-hidden
              className="absolute rounded-full bg-neu-base ring-[1.5px] ring-amber-400/70 shadow-raised-low"
              style={{ width: 13, height: 13, top: -16, right: triggerAnchor.right + triggerAnchor.width / 2 - Math.max(12, Math.min(triggerAnchor.right, 40)) - 6.5 }}
            />
            <motion.div
              animate={{ y: [0, -3, 0] }}
              transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
              className="relative rounded-[24px] ring-[1.5px] ring-amber-400/70"
              style={{ boxShadow: `var(--neu-raised-mid), ${AI_HALO}` }}
            >
              {/* The bubble itself is the 21st.dev Message Bubble (components/ui/message-bubble.tsx). */}
              <IdeaBubble variant="incoming" state="visible" maxWidth="100%" bodyStyle={{ display: "block", padding: "14px 40px 14px 14px", borderRadius: 24 }}>
                <button type="button" onClick={openPanel} className="flex w-full items-start gap-3 text-left">
                  <Lightbulb className="mt-0.5 size-5 shrink-0 text-amber-400" fill="currentColor" aria-hidden />
                  <span>{GREETING_TEXT}</span>
                </button>
              </IdeaBubble>
              <button
                type="button"
                aria-label="Dismiss"
                onClick={dismissGreeting}
                className="absolute right-2.5 top-2.5 z-20 flex h-6 w-6 cursor-pointer items-center justify-center rounded-full bg-neu-base text-primary shadow-raised-low transition hover:opacity-70"
              >
                <svg viewBox="0 0 24 24" fill="none" className="h-3 w-3">
                  <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showGreeting && !open && !hasTopBarTrigger && (
          // A <button> (the bubble, opens the panel) used to have another
          // interactive element (the dismiss control) nested inside it,
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
            transition={SPRING.snappy}
            // Same reasoning as the open panel above: no local
            // `--elev-border`/`--elev-bg` override anymore, so this greeting
            // bubble reads the same elevated-glass material every other
            // `glass-surface-elevated` on the site does.
            className="relative max-w-[240px] rounded-2xl text-body text-primary shadow-raised-mid"
          >
            <AiBorder rounded="rounded-2xl" surface="bg-neu-base" />
            <button type="button" onClick={openPanel} className="relative z-10 block w-full rounded-2xl px-4 py-3 text-left">
              {GREETING_TEXT}
            </button>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={dismissGreeting}
              className="absolute -right-2 -top-2 flex h-6 w-6 cursor-pointer items-center justify-center rounded-full bg-neu-base text-primary shadow-raised-low transition hover:opacity-70"
            >
              <svg viewBox="0 0 24 24" fill="none" className="h-3 w-3">
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {!open && !hasTopBarTrigger && <AtomButton onClick={openPanel} label="Chat with Atom, your personal assistant" />}
    </div>,
    document.body,
  );
}

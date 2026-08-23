"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { PulsingBorder } from "@paper-design/shaders-react";

/**
 * Atom — the "ask me anything" assistant, floating on every page (mounted
 * once in providers.tsx, same pattern as Toaster/CookieConsentBanner).
 *
 * The launcher reuses Hero.tsx's PulsingBorder shader treatment (signal-
 * green, the same palette/props) rather than a generic chat-bubble icon —
 * per direct instruction, keeping the shader but dropping the rotating
 * brand-copy text ring that surrounds it on the hero, since a floating
 * button doesn't have room to spare on decoration.
 *
 * Positioned at bottom-24 (not bottom-6, where ScrollToTopButton and the
 * marketing pages' footer live) specifically to clear that button and the
 * signed-in AppDock, which is centered but still close to the bottom edge.
 */

const GREETING_TEXT = "Hi I am Atom, your personal assistant. Ask me anything related to Bass Note Piano";
const GREETING_SEEN_KEY = "bnp-atom-greeting-seen";
const HISTORY_KEY = "bnp-atom-history";
const GREETING_DELAY_MS = 1800;

const SUGGESTIONS = [
  "How much does the curriculum cost?",
  "How do I book a class?",
  "What's the refund policy?",
  "I need help with my account",
];

interface Message {
  role: "user" | "assistant";
  content: string;
}

function readStoredHistory(): Message[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.sessionStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function AtomButton({ onClick, label }: { onClick: () => void; label: string }) {
  const reduced = useReducedMotion();
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="relative flex h-[60px] w-[60px] shrink-0 items-center justify-center rounded-full transition hover:scale-105 active:scale-95"
    >
      <PulsingBorder
        colors={["#05e901", "#0d2e0a", "#e8fadb", "#145c0a", "#4dd946"]}
        colorBack="#00000000"
        speed={reduced ? 0 : 1.2}
        roundness={1}
        thickness={0.1}
        softness={0.2}
        intensity={4}
        spots={5}
        spotSize={0.1}
        pulse={reduced ? 0 : 0.1}
        smoke={0.5}
        smokeSize={4}
        scale={0.65}
        rotation={0}
        style={{ width: "60px", height: "60px", borderRadius: "50%" }}
      />
    </button>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isMine = message.role === "user";
  return (
    <div className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", bounce: 0, duration: 0.4 }}
        className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm ${
          isMine ? "bg-[rgb(var(--c-a-400))] text-slate-950" : "border border-ink/10 bg-slate-950 text-slate-100"
        }`}
      >
        <p className="whitespace-pre-wrap break-words">{message.content}</p>
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
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [showGreeting, setShowGreeting] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Portals need a real document — same SSR-safety pattern as NotificationBell.
  useEffect(() => {
    setMounted(true);
    setMessages(readStoredHistory());
  }, []);

  useEffect(() => {
    if (!mounted) return;
    try {
      window.sessionStorage.setItem(HISTORY_KEY, JSON.stringify(messages));
    } catch {
      // Safari private mode / storage full — the widget still works, it just
      // won't survive a page navigation this time.
    }
  }, [messages, mounted]);

  // Greeting bubble: once per browser session, only if the conversation is
  // still empty (a returning visitor mid-conversation doesn't need re-pitching).
  useEffect(() => {
    if (!mounted || messages.length > 0) return;
    if (window.sessionStorage.getItem(GREETING_SEEN_KEY)) return;
    const timer = setTimeout(() => setShowGreeting(true), GREETING_DELAY_MS);
    return () => clearTimeout(timer);
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

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    const nextHistory: Message[] = [...messages, { role: "user", content: trimmed }];
    setMessages(nextHistory);
    setInput("");
    setError(null);
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
    } catch {
      setError("Couldn't reach Atom — check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    sendMessage(input);
  }

  if (!mounted) return null;

  return createPortal(
    <div className="fixed bottom-24 right-6 z-40 flex flex-col items-end gap-3">
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.96 }}
            transition={{ type: "spring", bounce: 0, duration: 0.3 }}
            className="glass-surface-elevated flex h-[min(70vh,560px)] w-[min(92vw,380px)] flex-col overflow-hidden rounded-2xl"
            role="dialog"
            aria-label="Chat with Atom"
          >
            <div className="flex items-center gap-3 border-b border-ink/10 px-4 py-3">
              <div className="h-8 w-8 shrink-0">
                <PulsingBorder
                  colors={["#05e901", "#0d2e0a", "#e8fadb", "#145c0a", "#4dd946"]}
                  colorBack="#00000000"
                  speed={0.8}
                  roundness={1}
                  thickness={0.15}
                  softness={0.2}
                  intensity={4}
                  spots={5}
                  spotSize={0.1}
                  pulse={0.1}
                  smoke={0.5}
                  smokeSize={4}
                  scale={0.65}
                  rotation={0}
                  style={{ width: "32px", height: "32px", borderRadius: "50%" }}
                />
              </div>
              <div className="min-w-0 flex-1">
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

            <div className="min-w-0 flex-1 space-y-2 overflow-y-auto p-4">
              {messages.length === 0 && (
                <div className="space-y-3">
                  <p className="text-sm text-slate-400">
                    Hi, I&apos;m Atom. Ask me about pricing, booking a class, policies, or anything else about Bass
                    Note Piano.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {SUGGESTIONS.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => sendMessage(s)}
                        className="rounded-full border border-ink/10 px-3 py-1.5 text-xs text-slate-300 transition hover:border-[rgb(var(--c-a-400)/0.4)] hover:text-[rgb(var(--c-a-300))]"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((m, i) => (
                <MessageBubble key={i} message={m} />
              ))}
              {loading && <TypingIndicator />}
              {error && <p className="text-center text-xs text-red-400">{error}</p>}
              <div ref={messagesEndRef} />
            </div>

            <form onSubmit={handleSubmit} className="flex min-w-0 gap-2 border-t border-ink/10 p-3">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask Atom anything…"
                maxLength={2000}
                disabled={loading}
                className="min-w-0 flex-1 rounded-xl border border-ink/10 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-[rgb(var(--c-a-400)/0.4)]"
              />
              <button
                type="submit"
                disabled={loading || !input.trim()}
                aria-label="Send"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[rgb(var(--c-a-400))] text-slate-950 transition disabled:opacity-40"
              >
                <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
                  <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showGreeting && !open && (
          <motion.button
            type="button"
            onClick={openPanel}
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ type: "spring", bounce: 0, duration: 0.3 }}
            className="glass-surface-elevated relative max-w-[240px] rounded-2xl px-4 py-3 text-left text-sm leading-relaxed text-slate-100"
          >
            <span
              role="button"
              tabIndex={0}
              aria-label="Dismiss"
              onClick={(e) => {
                e.stopPropagation();
                dismissGreeting();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.stopPropagation();
                  dismissGreeting();
                }
              }}
              className="absolute -right-2 -top-2 flex h-6 w-6 cursor-pointer items-center justify-center rounded-full border border-ink/10 bg-slate-950 text-slate-400 transition hover:text-slate-200"
            >
              <svg viewBox="0 0 24 24" fill="none" className="h-3 w-3">
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </span>
            {GREETING_TEXT}
          </motion.button>
        )}
      </AnimatePresence>

      {!open && <AtomButton onClick={openPanel} label="Chat with Atom, your personal assistant" />}
    </div>,
    document.body,
  );
}

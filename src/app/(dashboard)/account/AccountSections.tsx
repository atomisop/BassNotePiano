"use client";

import { useSwr } from "@/lib/useSwr";
import { MIN_PASSWORD_LENGTH, passwordRequirementError } from "@/lib/passwordRules";
import { PasswordStrength } from "@/components/ui/password-strength";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { Switch } from "@/components/ui/switch";
import { PasswordInput } from "@/components/ui/password-input";
import { CheckIcon } from "@/components/ui/icons";
import { MorphingSquare } from "@/components/ui/morphing-square";
import { ParentLinksPanel } from "@/components/parent/ParentLinksPanel";
import { AddToHomeSteps, isStandalone } from "@/components/pwa/AddToHomeSteps";
import { updatePasswordAction, requestPasswordChangeCodeAction, signOutOtherDevicesAction, listSignedInDevicesAction, type SignedInDevice, updateNotificationPreferencesAction, requestAccountDeletionCodeAction, confirmAccountDeletionAction, type NotificationPreferencesInput } from "./actions";
import { startNavigation } from "@/lib/navigationState";
import { buttonVariants } from "@/components/ui/button";
import { Laptop, Smartphone, Tablet } from "@/components/ui/appIcons";
import { CHUNKED_CODE_LENGTH, chunkCode } from "@/lib/codeChunks";
import { SectionCard } from "./SectionCard";

// Matches actions.ts's own constant of the same name (and the auth pages').

export function PasswordSection() {
  const { update } = useSession();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [awaitingCode, setAwaitingCode] = useState(false);
  const [code, setCode] = useState("");

  function cancelCode() {
    setAwaitingCode(false);
    setCode("");
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    const passwordError = passwordRequirementError(newPassword);
    if (passwordError) {
      setError(passwordError);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New passwords don't match.");
      return;
    }

    setSubmitting(true);
    if (!awaitingCode) {
      const sent = await requestPasswordChangeCodeAction(currentPassword, newPassword);
      setSubmitting(false);
      if (!sent.ok) {
        setError(sent.error);
        return;
      }
      setAwaitingCode(true);
      return;
    }
    const result = await updatePasswordAction(currentPassword, newPassword, code);
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setAwaitingCode(false);
    setCode("");
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setSuccess(true);
    // The password change just bumped sessionVersion so every OTHER open
    // session gets signed out (see updatePasswordAction), update() forces
    // this device's own JWT to re-stamp against the new value right now,
    // rather than waiting for its next natural refresh, so it isn't
    // accidentally caught by the same check.
    await update();
  }

  return (
    <div className="space-y-6">
      <SectionCard title="Password">
        <form onSubmit={handleSubmit} className="space-y-3">
          <PasswordInput
            placeholder="Current password"
            autoComplete="current-password"
            required
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            disabled={submitting || awaitingCode}
            className="w-full disabled:opacity-60"
          />
          <div>
            <PasswordInput
              placeholder="New password"
              autoComplete="new-password"
              required
              minLength={MIN_PASSWORD_LENGTH}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              disabled={submitting || awaitingCode}
              className="w-full disabled:opacity-60"
            />
            {newPassword.length > 0 && <PasswordStrength value={newPassword} className="mt-3" />}
          </div>
          <div>
            <PasswordInput
              placeholder="Confirm new password"
              autoComplete="new-password"
              required
              minLength={MIN_PASSWORD_LENGTH}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={submitting || awaitingCode}
              className="w-full disabled:opacity-60"
            />
            {confirmPassword.length > 0 && (
              <p className={`mt-1.5 flex items-center gap-1.5 text-small ${newPassword === confirmPassword ? "text-slate-50" : "text-slate-500"}`}>
                <CheckIcon size={11} className={newPassword === confirmPassword ? "opacity-100" : "opacity-30"} />
                {newPassword === confirmPassword ? "Passwords match" : "Passwords don't match yet"}
              </p>
            )}
          </div>

          {awaitingCode && (
            <div className="space-y-2">
              <p className="text-small text-slate-500">
                Enter the 6-digit code we emailed you.
              </p>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="6-digit code"
                maxLength={CHUNKED_CODE_LENGTH}
                autoFocus
                required
                value={chunkCode(code)}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                disabled={submitting}
                className="h-11 w-full rounded-control border border-(--neu-edge) bg-neu-base px-3 py-2 text-center text-body tracking-[0.4em] text-slate-100 shadow-pressed-low outline-none transition focus:border-signal/60 disabled:opacity-60"
              />
            </div>
          )}

          {error && <p className="text-small text-red-400">{error}</p>}
          {success && <p className="text-small text-slate-50">Password updated. Other devices have been signed out.</p>}

          {awaitingCode && (
            <button
              type="button"
              onClick={cancelCode}
              disabled={submitting}
              className="tap flex w-full items-center justify-center rounded-full bg-neu-base py-2 text-small font-medium text-slate-300 shadow-raised-low transition hover:shadow-raised-mid active:shadow-pressed-low disabled:opacity-50"
            >
              Cancel
            </button>
          )}
          <button
            type="submit"
            disabled={submitting || (awaitingCode && code.length !== 6)}
            className={buttonVariants({ variant: "primary", className: "flex w-full" })}
          >
            {submitting && <MorphingSquare size={12} className="mr-1.5 shrink-0" />}
            {submitting ? (awaitingCode ? "Saving…" : "Sending code…") : awaitingCode ? "Confirm change" : "Send verification code"}
          </button>
        </form>
      </SectionCard>

      <div id="parent-mode" className="scroll-mt-24">
        <SectionCard title="Parent mode">
          <ParentLinksPanel />
        </SectionCard>
      </div>
      <ReferralCard />
      <PushCard />
      <CalendarFeedCard />
      <SignedInDevicesCard />
      <SignOutOtherDevicesCard />
    </div>
  );
}

const DEVICE_ICON = { Phone: Smartphone, Tablet: Tablet, Computer: Laptop } as const;

// Every browser and device this account is signed in on: what it is, roughly where, when it signed in, and a green dot while
// it has a tab open (gray otherwise). No IP addresses anywhere. Refreshes every minute and when other devices are signed out.
function ReferralCard() {
  // Shown from the last visit at once, refreshed behind it.
  const { data: swrData } = useSwr<{ link: string; joined: number; rewarded: number; percent: number; months: number }>("/api/me/referral");
  const data = swrData ?? null;
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(data.link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* the link is shown in full below */
    }
  }

  if (!data) return null;
  return (
    <SectionCard advanced title="Invite a friend">
      <p className="text-small text-slate-400">
        Send your link. When your friend starts a 84 or 168 day plan and their first payment goes through, you both get {data.percent}% off for {data.months} months.
      </p>
      <label htmlFor="ref-link" className="sr-only">Your invite link</label>
      <input id="ref-link" readOnly value={data.link} onFocus={(e) => e.currentTarget.select()} className="mt-3 h-11 w-full rounded-lg bg-neu-base px-3 text-body text-slate-300 shadow-pressed-low outline-none focus-visible:ring-2 focus-visible:ring-ring" />
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" onClick={copy} className={buttonVariants({ variant: "primary", size: "sm", className: "text-black" })}>{copied ? "Copied" : "Copy link"}</button>
        <span className="text-small text-slate-400">
          {data.joined === 0 ? "No one has joined yet." : `${data.joined} joined, ${data.rewarded} earned the discount.`}
        </span>
      </div>
    </SectionCard>
  );
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

type PushState = "loading" | "unavailable" | "needs-home-screen" | "unsupported" | "blocked" | "off" | "on";

/** Class and practice reminders as push notifications. On an iPhone the browser only allows it once the site is on the Home Screen. */
function PushCard() {
  const [state, setState] = useState<PushState>("loading");
  const [key, setKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const ua = navigator.userAgent;
        const isIos = /iPhone|iPad|iPod/.test(ua);
        const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
        const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
        if (isIos && !standalone) return alive && setState("needs-home-screen");
        if (!supported) return alive && setState("unsupported");
        let endpoint = "";
        const reg = await navigator.serviceWorker.getRegistration("/sw.js");
        const existing = await reg?.pushManager.getSubscription();
        if (existing) endpoint = existing.endpoint;
        const r = await fetch(`/api/me/push${endpoint ? `?endpoint=${encodeURIComponent(endpoint)}` : ""}`, { cache: "no-store" });
        if (!r.ok || !alive) return;
        const d = (await r.json()) as { publicKey: string | null; subscribedHere: boolean };
        setKey(d.publicKey);
        if (!d.publicKey) return setState("unavailable");
        if (Notification.permission === "denied") return setState("blocked");
        setState(d.subscribedHere ? "on" : "off");
      } catch {
        if (alive) setState("unsupported");
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  async function turnOn() {
    if (!key) return;
    setBusy(true);
    setMessage(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "blocked" : "off");
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) as BufferSource });
      const r = await fetch("/api/me/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sub.toJSON()) });
      if (!r.ok) throw new Error("save failed");
      setState("on");
    } catch {
      setMessage("Couldn't turn it on. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    setBusy(true);
    setMessage(null);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/me/push", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) });
        await sub.unsubscribe();
      }
      setState("off");
    } catch {
      setMessage("Couldn't turn it off. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function sendTest() {
    setBusy(true);
    setMessage(null);
    try {
      const r = await fetch("/api/me/push/test", { method: "POST" });
      const d = await r.json().catch(() => ({}));
      setMessage(r.ok ? (d.delivered > 0 ? "Sent. It should arrive in a few seconds." : "Nothing was delivered. Turn it off and on again.") : (d.error ?? "Couldn't send a test."));
    } finally {
      setBusy(false);
    }
  }

  if (state === "loading" || state === "unavailable") return null;

  return (
    <SectionCard advanced title="Reminders on your phone">
      {state === "needs-home-screen" && (
        <p className="mt-3 text-small text-slate-300">
          On iPhone and iPad, first add Bass Note Piano to your Home Screen: tap the Share button in Safari, then &quot;Add to Home Screen&quot;, open it from there and come back to this page.
        </p>
      )}
      {state === "unsupported" && <p className="mt-3 text-small text-slate-500">This browser can&apos;t show push notifications. Email reminders still work.</p>}
      {state === "blocked" && <p className="mt-3 text-small text-slate-300">Notifications are blocked for this site. Allow them in your browser or phone settings, then come back.</p>}
      {state === "off" && (
        <button type="button" disabled={busy} onClick={turnOn} className={`mt-3 ${buttonVariants({ variant: "primary", size: "sm", className: "text-black" })}`}>
          {busy ? "Working…" : "Turn on reminders here"}
        </button>
      )}
      {state === "on" && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-small text-slate-300">On for this device.</span>
          <button type="button" disabled={busy} onClick={sendTest} className={buttonVariants({ variant: "secondary", size: "sm" })}>Send a test</button>
          <button type="button" disabled={busy} onClick={turnOff} className={buttonVariants({ variant: "secondary", size: "sm" })}>Turn off</button>
        </div>
      )}
      {message && <p className="mt-2 text-small text-slate-300" role="status">{message}</p>}
    </SectionCard>
  );
}

function CalendarFeedCard() {
  const [links, setLinks] = useState<{ https: string; webcal: string } | null | undefined>(undefined);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/me/calendar", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => alive && setLinks(d?.links ?? null))
      .catch(() => alive && setLinks(null));
    return () => {
      alive = false;
    };
  }, []);

  async function copy() {
    if (!links) return;
    try {
      await navigator.clipboard.writeText(links.https);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* the link is also shown in full to copy by hand */
    }
  }

  async function reset() {
    setBusy(true);
    try {
      const r = await fetch("/api/me/calendar", { method: "POST" });
      if (r.ok) setLinks((await r.json()).links);
    } finally {
      setBusy(false);
      setConfirmReset(false);
    }
  }

  return (
    <SectionCard advanced title="Your classes in your calendar" hint="Keep the link private: anyone who has it can see your class times.">
      {links === undefined ? (
        <p className="mt-3 text-small text-slate-500">Loading…</p>
      ) : links === null ? (
        <p className="mt-3 text-small text-slate-500">Couldn&apos;t load your link. Refresh the page.</p>
      ) : (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap gap-2">
            <a href={links.webcal} className={buttonVariants({ variant: "primary", size: "sm", className: "text-black" })}>Subscribe on this device</a>
            <button type="button" onClick={copy} className={buttonVariants({ variant: "secondary", size: "sm" })}>{copied ? "Copied" : "Copy link"}</button>
          </div>
          <label htmlFor="cal-link" className="sr-only">Your calendar link</label>
          <input id="cal-link" readOnly value={links.https} onFocus={(e) => e.currentTarget.select()} className="h-11 w-full rounded-lg bg-neu-base px-3 text-body text-slate-300 shadow-pressed-low outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          {!confirmReset ? (
            <button type="button" onClick={() => setConfirmReset(true)} className="text-small text-slate-400 underline underline-offset-4 hover:text-slate-200">Make a new link</button>
          ) : (
            <div className="rounded-xl bg-neu-base p-4 shadow-raised-low">
              <p className="text-small text-slate-200">The old link stops working. Calendars that use it will need the new one.</p>
              <div className="mt-3 flex gap-2">
                <button type="button" disabled={busy} onClick={reset} className={buttonVariants({ variant: "primary", size: "sm", className: "text-black" })}>{busy ? "Working…" : "Make a new link"}</button>
                <button type="button" disabled={busy} onClick={() => setConfirmReset(false)} className={buttonVariants({ variant: "secondary", size: "sm" })}>Keep it</button>
              </div>
            </div>
          )}
        </div>
      )}
    </SectionCard>
  );
}

function SignedInDevicesCard() {
  const [devices, setDevices] = useState<SignedInDevice[] | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      listSignedInDevicesAction()
        .then((rows) => alive && setDevices(rows))
        .catch(() => alive && setDevices((prev) => prev ?? []));
    void load();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 60_000);
    window.addEventListener("bnp:devices-changed", load);
    return () => {
      alive = false;
      clearInterval(timer);
      window.removeEventListener("bnp:devices-changed", load);
    };
  }, []);

  return (
    <SectionCard advanced title="Where you are signed in">
      {devices === null ? (
        <p className="text-small text-slate-500">Loading…</p>
      ) : devices.length === 0 ? (
        <p className="text-small text-slate-500">Nothing to show yet.</p>
      ) : (
        <ul className="divide-y divide-slate-50/10">
          {devices.map((d) => {
            const Icon = DEVICE_ICON[d.kind];
            return (
              <li key={d.id} className="flex items-center gap-3 py-3">
                <Icon className="h-5 w-5 shrink-0 text-slate-400" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-body text-slate-50">
                    <span className="min-w-0 break-words">{d.label}</span>
                    {d.isThisDevice && <span className="rounded-full bg-neu-base px-2 py-0.5 text-small text-slate-300 shadow-pressed-low">This device</span>}
                  </p>
                  <p className="text-small text-slate-400">
                    {d.place ?? "Location unavailable"} · Signed in{" "}
                    {new Date(d.signedInAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                  </p>
                </div>
                <span className="flex shrink-0 items-center gap-1.5 text-small text-slate-400">
                  <span aria-hidden className={`h-2.5 w-2.5 rounded-full ${d.active ? "bg-green-400 shadow-[0_0_6px_rgb(74_222_128/0.8)]" : "bg-slate-600"}`} />
                  {d.active ? "Active now" : "Not active"}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}

// Standalone, on-demand version of what a password change now also does,
// for someone who wants this without changing their password, e.g. after
// using a shared or public computer.
function SignOutOtherDevicesCard() {
  const { update } = useSession();
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleClick() {
    setSubmitting(true);
    await signOutOtherDevicesAction();
    // Re-stamp this device's own token first, same reasoning as the
    // password form above, so this button doesn't sign out the device that
    // clicked it.
    await update();
    setSubmitting(false);
    setSuccess(true);
    window.dispatchEvent(new Event("bnp:devices-changed"));
  }

  return (
    <SectionCard advanced title="Sign out of other devices">
      <button
        type="button"
        onClick={handleClick}
        disabled={submitting}
        className={buttonVariants({ variant: "secondary" })}
      >
        {submitting && <MorphingSquare size={12} className="mr-1.5 shrink-0" />}
        {submitting ? "Signing out other devices…" : "Sign out of all other devices"}
      </button>
      {success && !submitting && <p className="mt-3 text-small text-slate-50">Done. This device stays signed in.</p>}
    </SectionCard>
  );
}

// Three stages: the button sits alone until clicked (nothing pre-filled,
// nothing pre-triggered), then a password field + "send code" button, then,
// once a code has actually been emailed, the code field, the explicit
// confirmation checkbox, and the real delete button. Password and code are
// both re-checked server-side on the final submit regardless of what this
// component thinks already happened (see confirmAccountDeletionAction).
export function DangerZoneSection() {
  const [stage, setStage] = useState<"idle" | "password" | "code">("idle");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sendingCode, setSendingCode] = useState(false);
  const [deleting, setDeleting] = useState(false);

  function reset() {
    setStage("idle");
    setPassword("");
    setCode("");
    setConfirmed(false);
    setError(null);
  }

  async function handleSendCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSendingCode(true);
    const result = await requestAccountDeletionCodeAction(password);
    setSendingCode(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setStage("code");
  }

  async function handleDelete(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!confirmed) {
      setError("Confirm you understand this can't be undone.");
      return;
    }
    setDeleting(true);
    const result = await confirmAccountDeletionAction(password, code);
    if (!result.ok) {
      setDeleting(false);
      setError(result.error);
      return;
    }
    // The account row is already gone server-side, this just clears the
    // browser's session cookie and leaves. Not setDeleting(false): there's
    // nothing left to re-enable a form for.
    startNavigation();
    await signOut({ callbackUrl: "/" });
  }

  return (
    <SectionCard advanced title="Danger zone">
      <div className="rounded-xl border border-red-500/30 bg-neu-base p-4 shadow-pressed-low">
        <p className="text-small text-slate-200">
          This deletes your profile, curriculum progress, class bookings, credits, messages, and everything else tied
          to your account.
        </p>
        <p className="mt-1.5 text-small font-medium text-red-300">
          This can&apos;t be undone. Once your data is deleted there is no way to get it back, not even by
          contacting us.
        </p>

        {stage === "idle" && (
          <button
            type="button"
            onClick={() => setStage("password")}
            className={buttonVariants({ variant: "danger", className: "mt-4" })}
          >
            Delete my account
          </button>
        )}

        {stage === "password" && (
          <form onSubmit={handleSendCode} className="mt-4 space-y-3">
            <PasswordInput
              placeholder="Current password"
              autoComplete="current-password"
              autoFocus
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={sendingCode}
              className="w-full focus:border-red-400/60 disabled:opacity-60"
            />
            {error && <p className="text-small text-red-400">{error}</p>}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={reset}
                disabled={sendingCode}
                className="tap flex-1 rounded-full py-2 text-small font-medium text-slate-300 transition disabled:opacity-50 bg-neu-base shadow-raised-low hover:shadow-raised-mid active:shadow-pressed-low"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={sendingCode || !password}
                className="tap flex flex-1 items-center justify-center rounded-full bg-red-600 py-2 text-small font-semibold text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50 shadow-raised-low active:shadow-pressed-low hover:shadow-raised-mid"
              >
                {sendingCode && <MorphingSquare size={12} className="mr-1.5 shrink-0" />}
                {sendingCode ? "Sending code…" : "Send verification code"}
              </button>
            </div>
          </form>
        )}

        {stage === "code" && (
          <form onSubmit={handleDelete} className="mt-4 space-y-3">
            <p className="text-small text-slate-500">
              Enter the 6-digit code we emailed you.
            </p>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="6-digit code"
              maxLength={CHUNKED_CODE_LENGTH}
              autoFocus
              required
              value={chunkCode(code)}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              disabled={deleting}
              className="h-11 w-full rounded-control border border-(--neu-edge) bg-neu-base px-3 py-2 text-center text-body tracking-[0.4em] text-slate-100 shadow-pressed-low outline-none transition focus:border-red-400/60 disabled:opacity-60"
            />
            <label className="flex items-start gap-2 text-small text-slate-400">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                disabled={deleting}
                className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer appearance-none rounded-md border border-(--neu-edge) bg-neu-base shadow-pressed-low transition checked:border-transparent checked:bg-red-500 checked:bg-[length:70%] checked:bg-center checked:bg-no-repeat checked:bg-[url('data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22white%22 stroke-width=%223.5%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22%3E%3Cpath d=%22M5 12.5l4.5 4.5L19 7%22/%3E%3C/svg%3E')] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
              />
              I understand this permanently deletes my account and everything in it, and can&apos;t be undone.
            </label>
            {error && <p className="text-small text-red-400">{error}</p>}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={reset}
                disabled={deleting}
                className="tap flex-1 rounded-full py-2 text-small font-medium text-slate-300 transition disabled:opacity-50 bg-neu-base shadow-raised-low hover:shadow-raised-mid active:shadow-pressed-low"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={deleting || !confirmed || code.length !== 6}
                className="tap flex flex-1 items-center justify-center rounded-full bg-red-600 py-2 text-small font-semibold text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50 shadow-raised-low active:shadow-pressed-low hover:shadow-raised-mid"
              >
                {deleting && <MorphingSquare size={12} className="mr-1.5 shrink-0" />}
                {deleting ? "Deleting…" : "Permanently delete my account"}
              </button>
            </div>
          </form>
        )}
      </div>
    </SectionCard>
  );
}

export function TutorialsSection() {
  const router = useRouter();
  const [installed, setInstalled] = useState(false);
  useEffect(() => setInstalled(isStandalone()), []);
  return (
    <>
      <SectionCard advanced title="Tutorials">
        <button
          type="button"
          onClick={() => router.push("/dashboard?tour=1")}
          className={buttonVariants({ variant: "primary", className: "mt-4" })}
        >
          Replay app tour
        </button>
      </SectionCard>
      <SectionCard advanced title="Add to your Home Screen">
        <p className="text-small text-slate-400">
          {installed
            ? "You are already using Bass Note Piano from your Home Screen. The steps are here in case you set up another phone."
            : "Put Bass Note Piano on your Home Screen so it opens full screen with its own icon, like an app from the store."}
        </p>
        <div className="mt-4">
          <AddToHomeSteps />
        </div>
      </SectionCard>
    </>
  );
}

const NOTIFICATION_TOGGLES: { key: keyof NotificationPreferencesInput; label: string; description: string }[] = [
  {
    key: "notifyEmailPayments",
    label: "Payments and invoices",
    description: "Payment plan installment invoices, overdue reminders and credit expiry. Results you are waiting on (a payment approved, rejected or refunded) are always emailed.",
  },
  { key: "notifyEmailRoleUpdates", label: "Account updates", description: "Admin access, and changes to your Discord, phone number and signed-in devices." },
  { key: "notifyEmailSocial", label: "Social", description: "Friend requests, new messages, and messages and announcements from the studio." },
  {
    key: "notifyEmailClasses",
    label: "Class updates",
    description: "A class booked for you, canceled, moved or marked, and changes to your weekly time.",
  },
  {
    key: "notifyEmailReminders",
    label: "Practice and class reminders",
    description: "The practice reminder banner at the top of the screen, practice nudges after days away, and the day-before and hour-before class reminder emails. Off means none of them. On by default when you subscribe to a class plan.",
  },
];

export function NotificationSettingsSection({ initial }: { initial: NotificationPreferencesInput }) {
  const [prefs, setPrefs] = useState(initial);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleToggle(key: keyof NotificationPreferencesInput, value: boolean) {
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    setSuccess(false);
    setSubmitting(true);
    await updateNotificationPreferencesAction(next);
    setSubmitting(false);
    setSuccess(true);
  }

  return (
    <SectionCard title="Notification settings">
      <div className="space-y-3">
        {NOTIFICATION_TOGGLES.map((item) => (
          <div key={item.key} className="flex items-center justify-between gap-4">
            <div>
              <p className="text-small text-slate-200">{item.label}</p>
              <p className="text-small text-slate-500">{item.description}</p>
            </div>
            <Switch
              checked={prefs[item.key]}
              onCheckedChange={(value) => handleToggle(item.key, value)}
              aria-label={item.label}
            />
          </div>
        ))}
      </div>
      {success && !submitting && <p className="mt-3 text-small text-slate-50">Saved.</p>}
    </SectionCard>
  );
}


"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { SlideOverPanel } from "@/components/layout/SlideOverPanel";
import { CodeGate } from "./CodeGate";
import {
  requestPasswordChangeAction,
  confirmPasswordChangeAction,
  updateNotificationPreferencesAction,
  type NotificationPreferencesInput,
} from "./actions";

interface LessonCredits {
  online: number;
  inPerson: number;
}

interface AccountSettingsProps {
  email: string;
  hasCurriculumAccess: boolean;
  lessonCredits: LessonCredits;
  initialNotificationPreferences: NotificationPreferencesInput;
}

const TAB_ICONS = {
  notifications:
    "M12 3a5 5 0 00-5 5v2.7c0 .57-.19 1.13-.53 1.58L5 14.5c-.94 1.24-.06 3 1.49 3h11.02c1.55 0 2.43-1.76 1.49-3l-1.47-2.22a2.67 2.67 0 01-.53-1.58V8a5 5 0 00-5-5zM9.5 19.5a2.5 2.5 0 005 0",
  membership: "M3 8h18M3 6h18v12a1 1 0 01-1 1H4a1 1 0 01-1-1V6zM7 15h4",
  password: "M12 15v2M6 10V7a6 6 0 1112 0v3M5 10h14v10a1 1 0 01-1 1H6a1 1 0 01-1-1V10z",
  chevron: "M9 18l6-6-6-6",
} as const;

const TABS = [
  { id: "notifications", label: "Notifications", icon: TAB_ICONS.notifications },
  { id: "membership", label: "Membership & Purchases", icon: TAB_ICONS.membership },
  { id: "password", label: "Password", icon: TAB_ICONS.password },
] as const;

type TabId = (typeof TABS)[number]["id"];

function TabIcon({ path, className = "h-[18px] w-[18px] shrink-0" }: { path: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path d={path} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SectionCard({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="glass-surface p-6">
      <h2 className="font-serif text-lg text-slate-50">{title}</h2>
      <p className="mt-1 text-sm text-slate-500">{description}</p>
      <div className="mt-4">{children}</div>
    </div>
  );
}

// lg+ only — a sticky always-visible nav beside the inline content, since
// there's room for both without it feeling cluttered.
function DesktopSettingsNav({ activeTab, onSelect }: { activeTab: TabId; onSelect: (tab: TabId) => void }) {
  return (
    <nav className="sticky top-6 hidden w-56 shrink-0 flex-col gap-1 self-start glass-surface p-2 lg:flex">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onSelect(tab.id)}
          className={`flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left text-sm transition ${
            activeTab === tab.id
              ? "border-amber-400/40 bg-slate-800 text-slate-50"
              : "border-transparent text-slate-400 hover:bg-slate-800/60 hover:text-slate-200"
          }`}
        >
          <TabIcon path={tab.icon} />
          {tab.label}
        </button>
      ))}
    </nav>
  );
}

// Below lg — a plain menu list, no content shown until tapped. Each row
// pushes a full-screen SlideOverPanel instead of swapping content in place.
function MobileSettingsMenu({ onSelect }: { onSelect: (tab: TabId) => void }) {
  return (
    <div className="glass-surface divide-y divide-white/10 lg:hidden">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onSelect(tab.id)}
          className="flex w-full items-center gap-3 px-4 py-4 text-left transition hover:bg-white/5"
        >
          <TabIcon path={tab.icon} className="h-5 w-5 shrink-0 text-slate-400" />
          <span className="flex-1 text-sm text-slate-100">{tab.label}</span>
          <TabIcon path={TAB_ICONS.chevron} className="h-4 w-4 shrink-0 text-slate-600" />
        </button>
      ))}
    </div>
  );
}

function TabContent({
  tab,
  email,
  hasCurriculumAccess,
  lessonCredits,
  initialNotificationPreferences,
}: {
  tab: TabId;
  email: string;
  hasCurriculumAccess: boolean;
  lessonCredits: LessonCredits;
  initialNotificationPreferences: NotificationPreferencesInput;
}) {
  if (tab === "notifications") return <NotificationSettingsSection initial={initialNotificationPreferences} />;
  if (tab === "membership") return <MembershipSection hasCurriculumAccess={hasCurriculumAccess} lessonCredits={lessonCredits} />;
  return <PasswordSection email={email} />;
}

function AccountSettingsInner({ email, hasCurriculumAccess, lessonCredits, initialNotificationPreferences }: AccountSettingsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const initialTab: TabId = TABS.some((t) => t.id === requestedTab) ? (requestedTab as TabId) : "notifications";
  const [activeTab, setActiveTab] = useState<TabId>(initialTab);
  const [mobileOpenTab, setMobileOpenTab] = useState<TabId | null>(null);

  // Deep links (e.g. the notification bell's "Notification settings" link)
  // land here with ?tab= set — on a narrow screen that should open the
  // slide-over panel directly instead of silently doing nothing, since the
  // menu list below shows no content on its own.
  useEffect(() => {
    if (!requestedTab || !TABS.some((t) => t.id === requestedTab)) return;
    if (window.matchMedia("(max-width: 1023px)").matches) {
      setMobileOpenTab(requestedTab as TabId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function selectDesktopTab(tab: TabId) {
    setActiveTab(tab);
    router.replace(`/account?tab=${tab}`, { scroll: false });
  }

  function openMobileTab(tab: TabId) {
    setActiveTab(tab);
    setMobileOpenTab(tab);
    router.replace(`/account?tab=${tab}`, { scroll: false });
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-amber-400/80">Settings</p>
        <h1 className="mt-1.5 font-serif text-2xl text-slate-50">Account</h1>
        <p className="mt-1 text-sm text-slate-500">
          Every change here is confirmed with a 6-digit code sent to <span className="text-slate-300">{email}</span>. Want to
          edit your name, username, or photo? Head to{" "}
          <Link href="/profile" className="text-amber-300 hover:text-amber-200">
            your profile
          </Link>
          .
        </p>
      </div>

      <div className="mt-6 flex flex-col gap-8 lg:flex-row">
        <DesktopSettingsNav activeTab={activeTab} onSelect={selectDesktopTab} />
        <MobileSettingsMenu onSelect={openMobileTab} />

        <div className="hidden min-w-0 flex-1 space-y-6 lg:block">
          <TabContent
            tab={activeTab}
            email={email}
            hasCurriculumAccess={hasCurriculumAccess}
            lessonCredits={lessonCredits}
            initialNotificationPreferences={initialNotificationPreferences}
          />
        </div>
      </div>

      <SlideOverPanel
        open={mobileOpenTab !== null}
        onClose={() => setMobileOpenTab(null)}
        title={mobileOpenTab ? TABS.find((t) => t.id === mobileOpenTab)!.label : ""}
      >
        {mobileOpenTab && (
          <TabContent
            tab={mobileOpenTab}
            email={email}
            hasCurriculumAccess={hasCurriculumAccess}
            lessonCredits={lessonCredits}
            initialNotificationPreferences={initialNotificationPreferences}
          />
        )}
      </SlideOverPanel>
    </div>
  );
}

export function AccountSettings(props: AccountSettingsProps) {
  return (
    <Suspense fallback={null}>
      <AccountSettingsInner {...props} />
    </Suspense>
  );
}

function MembershipSection({
  hasCurriculumAccess,
  lessonCredits,
}: {
  hasCurriculumAccess: boolean;
  lessonCredits: { online: number; inPerson: number };
}) {
  return (
    <SectionCard title="Membership & purchases" description="Your plan, lesson credits, and payment history.">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 p-4">
        <div>
          <p className="text-sm text-slate-100">{hasCurriculumAccess ? "Curriculum unlocked" : "Curriculum not yet purchased"}</p>
          <p className="mt-0.5 text-xs text-slate-500">
            {hasCurriculumAccess ? "All six scale groups are unlocked, for good." : "One-time $99 payment unlocks every scale, for good."}
          </p>
        </div>
        {!hasCurriculumAccess && (
          <Link
            href="/billing/curriculum"
            className="cta-sheen rounded-lg bg-amber-400 px-4 py-2 text-xs font-semibold text-slate-950 transition hover:bg-amber-300"
          >
            Unlock — $99
          </Link>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 p-4">
        <div>
          <p className="text-sm text-slate-100">Live lesson credits</p>
          <p className="mt-0.5 text-xs text-slate-500">
            {lessonCredits.online} online · {lessonCredits.inPerson} in-person remaining
          </p>
        </div>
        <Link
          href="/billing/lessons"
          className="rounded-lg border border-white/15 px-4 py-2 text-xs font-medium text-slate-200 transition hover:border-amber-400/40 hover:text-amber-200"
        >
          Buy lessons
        </Link>
      </div>

      <Link
        href="/billing/history"
        className="mt-3 flex items-center justify-between rounded-xl border border-white/10 p-4 text-sm text-slate-200 transition hover:border-amber-400/30 hover:text-amber-200"
      >
        Payment history
        <span className="text-slate-500">→</span>
      </Link>
    </SectionCard>
  );
}

function PasswordSection({ email }: { email: string }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [awaitingCode, setAwaitingCode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (newPassword !== confirmPassword) {
      setError("New passwords don't match.");
      return;
    }

    setSubmitting(true);
    const result = await requestPasswordChangeAction(currentPassword, newPassword);
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setAwaitingCode(true);
  }

  return (
    <SectionCard title="Password" description="Changing it signs out any other devices you've marked as remembered.">
      <form onSubmit={handleSubmit} className="space-y-3">
        <input
          type="password"
          placeholder="Current password"
          autoComplete="current-password"
          required
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          disabled={awaitingCode}
          className="w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-amber-400/60 disabled:opacity-60"
        />
        <input
          type="password"
          placeholder="New password"
          autoComplete="new-password"
          required
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          disabled={awaitingCode}
          className="w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-amber-400/60 disabled:opacity-60"
        />
        <input
          type="password"
          placeholder="Confirm new password"
          autoComplete="new-password"
          required
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          disabled={awaitingCode}
          className="w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-amber-400/60 disabled:opacity-60"
        />

        {error && <p className="text-xs text-red-400">{error}</p>}
        {success && <p className="text-xs text-emerald-400">Password updated.</p>}

        <button
          type="submit"
          disabled={submitting || awaitingCode}
          className="cta-sheen w-full rounded-lg bg-amber-400 py-2 text-xs font-semibold text-slate-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? "Sending…" : "Change password"}
        </button>
      </form>

      {awaitingCode && (
        <CodeGate
          email={email}
          onConfirm={confirmPasswordChangeAction}
          onResend={async () => {
            await requestPasswordChangeAction(currentPassword, newPassword);
          }}
          onCancel={() => setAwaitingCode(false)}
          onSuccess={async () => {
            setAwaitingCode(false);
            setCurrentPassword("");
            setNewPassword("");
            setConfirmPassword("");
            setSuccess(true);
          }}
        />
      )}
    </SectionCard>
  );
}

const NOTIFICATION_TOGGLES: { key: keyof NotificationPreferencesInput; label: string; description: string }[] = [
  { key: "notifyEmailPayments", label: "Payment approvals", description: "Zelle payments verified or rejected." },
  { key: "notifyEmailRoleUpdates", label: "Role updates", description: "Granted Admin access." },
  { key: "notifyEmailSocial", label: "Social", description: "Friend requests and new messages." },
  { key: "notifyEmailReminders", label: "Practice reminders", description: "Nudges after a few days away." },
];

function Toggle({ checked, onChange }: { checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative h-5 w-9 shrink-0 rounded-full transition ${checked ? "bg-amber-400 hover:bg-amber-300" : "bg-slate-800 hover:bg-slate-700"}`}
    >
      <span
        className={`absolute top-0.5 h-4 w-4 rounded-full bg-slate-950 transition ${checked ? "left-[18px]" : "left-0.5"}`}
      />
    </button>
  );
}

function NotificationSettingsSection({ initial }: { initial: NotificationPreferencesInput }) {
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
    <SectionCard title="Notification settings" description="The in-app bell always shows these — choose which also send an email.">
      <div className="space-y-3">
        {NOTIFICATION_TOGGLES.map((item) => (
          <div key={item.key} className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm text-slate-200">{item.label}</p>
              <p className="text-xs text-slate-500">{item.description}</p>
            </div>
            <Toggle checked={prefs[item.key]} onChange={(value) => handleToggle(item.key, value)} />
          </div>
        ))}
      </div>
      {success && !submitting && <p className="mt-3 text-xs text-emerald-400">Saved.</p>}
    </SectionCard>
  );
}

"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { SlideOverPanel } from "@/components/layout/SlideOverPanel";
import { ThemePicker } from "@/components/theme/ThemePicker";
import { Switch } from "@/components/ui/switch";
import { updatePasswordAction, updateNotificationPreferencesAction, type NotificationPreferencesInput } from "./actions";

interface AccountSettingsProps {
  hasCurriculumAccess: boolean;
  classCredits: number;
  initialNotificationPreferences: NotificationPreferencesInput;
}

const TAB_ICONS = {
  notifications:
    "M12 3a5 5 0 00-5 5v2.7c0 .57-.19 1.13-.53 1.58L5 14.5c-.94 1.24-.06 3 1.49 3h11.02c1.55 0 2.43-1.76 1.49-3l-1.47-2.22a2.67 2.67 0 01-.53-1.58V8a5 5 0 00-5-5zM9.5 19.5a2.5 2.5 0 005 0",
  membership: "M3 8h18M3 6h18v12a1 1 0 01-1 1H4a1 1 0 01-1-1V6zM7 15h4",
  password: "M12 15v2M6 10V7a6 6 0 1112 0v3M5 10h14v10a1 1 0 01-1 1H6a1 1 0 01-1-1V10z",
  tutorials: "M12 21a9 9 0 100-18 9 9 0 000 18zM12 7v5l3 3",
  appearance:
    "M12 3a9 9 0 000 18c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1-.24-.27-.39-.62-.39-1 0-.83.67-1.5 1.5-1.5H16a5 5 0 005-5c0-4.42-4.03-8-9-8zM7.5 11a1 1 0 100-2 1 1 0 000 2zm3-3a1 1 0 100-2 1 1 0 000 2zm5 0a1 1 0 100-2 1 1 0 000 2z",
  chevron: "M9 18l6-6-6-6",
  about: "M12 21a9 9 0 100-18 9 9 0 000 18zM12 11v5M12 7.5h.01",
  logout: "M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9",
} as const;

const TABS = [
  { id: "notifications", label: "Notifications", icon: TAB_ICONS.notifications },
  { id: "membership", label: "Membership & Purchases", icon: TAB_ICONS.membership },
  { id: "password", label: "Password", icon: TAB_ICONS.password },
  { id: "appearance", label: "Themes & Appearance", icon: TAB_ICONS.appearance },
  { id: "tutorials", label: "Tutorials", icon: TAB_ICONS.tutorials },
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
// Not a tab (nothing appears inline for it) — a real link out to the
// existing `/about` page, which is its own substantial tabbed page
// (About/Update notes/Terms). Styled to match the tab buttons above it so
// it reads as part of the same list.
function AboutLink() {
  return (
    <Link
      href="/about"
      className="flex items-center gap-2.5 rounded-xl border border-transparent px-3 py-2.5 text-left text-sm text-slate-400 transition hover:bg-slate-800/60 hover:text-slate-200"
    >
      <TabIcon path={TAB_ICONS.about} />
      About
    </Link>
  );
}

// Same subdued styling the old Sidebar's sign-out button used — an action,
// not a destructive-red warning.
function SignOutButton({ className = "" }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={() => signOut({ callbackUrl: "/" })}
      className={`flex items-center gap-2.5 rounded-xl border border-transparent px-3 py-2.5 text-left text-sm text-slate-400 transition hover:bg-slate-800/60 hover:text-slate-200 ${className}`}
    >
      <TabIcon path={TAB_ICONS.logout} />
      Sign out
    </button>
  );
}

// lg+ only — a sticky always-visible nav beside the inline content, since
// there's room for both without it feeling cluttered. "About" and "Sign
// out" sit below a divider, outside the TABS loop, so they always render
// last regardless of which tab is active.
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
              ? "border-[rgb(var(--c-a-400)/0.4)] bg-slate-800 text-slate-50"
              : "border-transparent text-slate-400 hover:bg-slate-800/60 hover:text-slate-200"
          }`}
        >
          <TabIcon path={tab.icon} />
          {tab.label}
        </button>
      ))}
      <div className="my-1 h-px bg-ink/10" />
      <AboutLink />
      <SignOutButton />
    </nav>
  );
}

// Below lg — a plain menu list, no content shown until tapped. Each row
// pushes a full-screen SlideOverPanel instead of swapping content in place.
// Same bottom-pinned About/Sign out pair as the desktop nav, always last.
function MobileSettingsMenu({ onSelect }: { onSelect: (tab: TabId) => void }) {
  return (
    <div className="glass-surface divide-y divide-ink/10 lg:hidden">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onSelect(tab.id)}
          className="flex w-full items-center gap-3 px-4 py-4 text-left transition hover:bg-ink/5"
        >
          <TabIcon path={tab.icon} className="h-5 w-5 shrink-0 text-slate-400" />
          <span className="flex-1 text-sm text-slate-100">{tab.label}</span>
          <TabIcon path={TAB_ICONS.chevron} className="h-4 w-4 shrink-0 text-slate-600" />
        </button>
      ))}
      <Link href="/about" className="flex w-full items-center gap-3 px-4 py-4 text-left transition hover:bg-ink/5">
        <TabIcon path={TAB_ICONS.about} className="h-5 w-5 shrink-0 text-slate-400" />
        <span className="flex-1 text-sm text-slate-100">About</span>
        <TabIcon path={TAB_ICONS.chevron} className="h-4 w-4 shrink-0 text-slate-600" />
      </Link>
      <SignOutButton className="w-full rounded-none px-4 py-4 hover:bg-ink/5" />
    </div>
  );
}

function TabContent({
  tab,
  hasCurriculumAccess,
  classCredits,
  initialNotificationPreferences,
}: {
  tab: TabId;
  hasCurriculumAccess: boolean;
  classCredits: number;
  initialNotificationPreferences: NotificationPreferencesInput;
}) {
  if (tab === "notifications") return <NotificationSettingsSection initial={initialNotificationPreferences} />;
  if (tab === "membership") return <MembershipSection hasCurriculumAccess={hasCurriculumAccess} classCredits={classCredits} />;
  if (tab === "appearance") return <AppearanceSection />;
  if (tab === "tutorials") return <TutorialsSection />;
  return <PasswordSection />;
}

function AppearanceSection() {
  return (
    <section>
      <h2 className="font-serif text-xl text-slate-50">Themes &amp; appearance</h2>
      <p className="mt-1.5 text-sm text-slate-500">
        Change how Bass Note Piano looks for you. Nothing here affects what anyone else sees.
      </p>
      <div className="mt-6">
        <ThemePicker />
      </div>
    </section>
  );
}

function AccountSettingsInner({ hasCurriculumAccess, classCredits, initialNotificationPreferences }: AccountSettingsProps) {
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
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-[rgb(var(--c-a-400)/0.8)]">Settings</p>
        <h1 className="mt-1.5 font-serif text-2xl text-slate-50">Account</h1>
        <p className="mt-1 text-sm text-slate-500">
          Want to edit your name, username, or photo? Head to{" "}
          <Link href="/profile" className="text-[rgb(var(--c-a-300))] hover:text-[rgb(var(--c-a-200))]">
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
            hasCurriculumAccess={hasCurriculumAccess}
            classCredits={classCredits}
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
            hasCurriculumAccess={hasCurriculumAccess}
            classCredits={classCredits}
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
  classCredits,
}: {
  hasCurriculumAccess: boolean;
  classCredits: number;
}) {
  return (
    <SectionCard title="Membership & purchases" description="Your plan, class credits, and payment history.">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink/10 p-4">
        <div>
          <p className="text-sm text-slate-100">{hasCurriculumAccess ? "Curriculum unlocked" : "Curriculum not yet purchased"}</p>
          <p className="mt-0.5 text-xs text-slate-500">
            {hasCurriculumAccess ? "All six scale groups are unlocked, for good." : "One-time $69.99 payment unlocks every scale, for good."}
          </p>
        </div>
        {!hasCurriculumAccess && (
          <Link
            href="/billing/curriculum"
            className="cta-sheen cta-fill rounded-lg px-4 py-2 text-xs font-semibold"
          >
            Unlock — $69.99
          </Link>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink/10 p-4">
        <div>
          <p className="text-sm text-slate-100">Weekly class credits</p>
          <p className="mt-0.5 text-xs text-slate-500">
            {classCredits} credit{classCredits === 1 ? "" : "s"} remaining · 1 credit = 30 min
          </p>
        </div>
        <Link
          href="/billing/lessons"
          className="rounded-lg border border-ink/10 px-4 py-2 text-xs font-medium text-slate-200 transition hover:border-[rgb(var(--c-a-400)/0.4)] hover:text-[rgb(var(--c-a-200))]"
        >
          Buy credits
        </Link>
      </div>

      <Link
        href="/billing/history"
        className="mt-3 flex items-center justify-between rounded-xl border border-ink/10 p-4 text-sm text-slate-200 transition hover:border-[rgb(var(--c-a-400)/0.3)] hover:text-[rgb(var(--c-a-200))]"
      >
        Payment history
        <span className="text-slate-500">→</span>
      </Link>
    </SectionCard>
  );
}

function PasswordSection() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
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
    const result = await updatePasswordAction(currentPassword, newPassword);
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setSuccess(true);
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
          disabled={submitting}
          className="w-full glass-surface-subtle px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-[rgb(var(--c-a-400)/0.6)] disabled:opacity-60"
        />
        <input
          type="password"
          placeholder="New password"
          autoComplete="new-password"
          required
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          disabled={submitting}
          className="w-full glass-surface-subtle px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-[rgb(var(--c-a-400)/0.6)] disabled:opacity-60"
        />
        <input
          type="password"
          placeholder="Confirm new password"
          autoComplete="new-password"
          required
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          disabled={submitting}
          className="w-full glass-surface-subtle px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-[rgb(var(--c-a-400)/0.6)] disabled:opacity-60"
        />

        {error && <p className="text-xs text-red-400">{error}</p>}
        {success && <p className="text-xs text-emerald-400">Password updated.</p>}

        <button
          type="submit"
          disabled={submitting}
          className="cta-sheen cta-fill w-full rounded-lg py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? "Saving…" : "Change password"}
        </button>
      </form>
    </SectionCard>
  );
}

function TutorialsSection() {
  const router = useRouter();
  return (
    <SectionCard title="Tutorials" description="Replay the app walkthrough — the same spotlight tour shown once when you first joined.">
      <p className="text-sm text-slate-400">
        A quick tour of the roadmap, online lessons, friends, messages, notifications, your profile, and settings —
        with a &quot;Skip tour&quot; option on every step if you want out early.
      </p>
      <button
        type="button"
        onClick={() => router.push("/dashboard?tour=1")}
        className="cta-sheen cta-fill mt-4 rounded-lg px-4 py-2 text-xs font-semibold"
      >
        Replay app tour
      </button>
    </SectionCard>
  );
}

const NOTIFICATION_TOGGLES: { key: keyof NotificationPreferencesInput; label: string; description: string }[] = [
  { key: "notifyEmailPayments", label: "Payment approvals", description: "Zelle payments verified or rejected." },
  { key: "notifyEmailRoleUpdates", label: "Role updates", description: "Granted Admin access." },
  { key: "notifyEmailSocial", label: "Social", description: "Friend requests and new messages." },
  { key: "notifyEmailReminders", label: "Practice reminders", description: "Nudges after a few days away." },
];

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
            <Switch
              checked={prefs[item.key]}
              onCheckedChange={(value) => handleToggle(item.key, value)}
              aria-label={item.label}
            />
          </div>
        ))}
      </div>
      {success && !submitting && <p className="mt-3 text-xs text-emerald-400">Saved.</p>}
    </SectionCard>
  );
}

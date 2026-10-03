"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { SlideOverPanel } from "@/components/layout/SlideOverPanel";
import { ThemePicker } from "@/components/theme/ThemePicker";
import { Switch } from "@/components/ui/switch";
import { PasswordInput } from "@/components/ui/password-input";
import { CheckIcon } from "@/components/ui/icons";
import { MorphingSquare } from "@/components/ui/morphing-square";
import { ManageSubscriptions, type ActivePlanInfo } from "@/components/account/ManageSubscriptions";
import type { AssistantMessage } from "@/lib/assistant";
import {
  updatePasswordAction,
  signOutOtherDevicesAction,
  updateNotificationPreferencesAction,
  requestAccountDeletionCodeAction,
  confirmAccountDeletionAction,
  changePaymentPlanTermAction,
  cancelPaymentPlanBySelfAction,
  type NotificationPreferencesInput,
} from "./actions";
import { SettingsLayout } from "@/components/layout/PageLayouts";

interface AccountSettingsProps {
  hasCurriculumAccess: boolean;
  initialNotificationPreferences: NotificationPreferencesInput;
  assistantHistory: AssistantMessage[];
  activePlan: ActivePlanInfo | null;
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
  danger: "M4 7h16M9 7V5a2 2 0 012-2h2a2 2 0 012 2v2m3 0-1 12a2 2 0 01-2 2H8a2 2 0 01-2-2L5 7h14z",
  privacy: "M12 3l7 3v5c0 5-3.5 8.5-7 10-3.5-1.5-7-5-7-10V6l7-3z",
} as const;

// Grouped into defined categories rather than one flat list — order here is
// render order, so entries in the same category stay adjacent. "Danger
// zone" is its own category rather than folded into "Account & security" on
// purpose: a destructive action should never blend visually into routine
// settings.
const TABS = [
  { id: "notifications", label: "Notifications", icon: TAB_ICONS.notifications, category: "Preferences" },
  { id: "appearance", label: "Themes & Appearance", icon: TAB_ICONS.appearance, category: "Preferences" },
  { id: "membership", label: "Membership & Purchases", icon: TAB_ICONS.membership, category: "Billing" },
  { id: "password", label: "Password & Security", icon: TAB_ICONS.password, category: "Account & security" },
  { id: "privacy", label: "Privacy & Data", icon: TAB_ICONS.privacy, category: "Account & security" },
  { id: "tutorials", label: "Tutorials", icon: TAB_ICONS.tutorials, category: "Help" },
  { id: "danger", label: "Delete Account", icon: TAB_ICONS.danger, category: "Danger zone" },
] as const;

type TabId = (typeof TABS)[number]["id"];
type Category = (typeof TABS)[number]["category"];

/** Groups TABS by category, preserving the array's own order — no re-sort,
    so category order is controlled entirely by TABS above. */
function groupedTabs(): { category: Category; tabs: (typeof TABS)[number][] }[] {
  const groups: { category: Category; tabs: (typeof TABS)[number][] }[] = [];
  for (const tab of TABS) {
    const last = groups[groups.length - 1];
    if (last && last.category === tab.category) {
      last.tabs.push(tab);
    } else {
      groups.push({ category: tab.category, tabs: [tab] });
    }
  }
  return groups;
}

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
      <h2 className="text-body text-slate-50 font-semibold">{title}</h2>
      <p className="mt-1 text-small text-slate-500">{description}</p>
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
      className="flex items-center gap-2.5 rounded-xl border border-transparent px-3 py-2.5 text-left text-small text-slate-400 transition hover:bg-slate-800/60 hover:text-slate-200"
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
      className={`flex items-center gap-2.5 rounded-xl border border-transparent px-3 py-2.5 text-left text-small text-slate-400 transition hover:bg-slate-800/60 hover:text-slate-200 ${className}`}
    >
      <TabIcon path={TAB_ICONS.logout} />
      Sign out
    </button>
  );
}

// Small uppercase divider between groups — text-slate-500, not -600: -600
// fails AA (4.5:1) for real text on this ground (see the accessibility
// pass's SiteFooter comment), and a category label is real text a sighted
// user reads to understand the grouping, not decoration.
function CategoryHeading({ category, isFirst }: { category: Category; isFirst: boolean }) {
  return (
    <p
      className={`px-3 pb-1 text-small font-semibold uppercase tracking-[0.16em] ${isFirst ? "" : "mt-3"} ${
        category === "Danger zone" ? "text-red-400/70" : "text-slate-500"
      }`}
    >
      {category}
    </p>
  );
}

// lg+ only — a sticky always-visible nav beside the inline content, since
// there's room for both without it feeling cluttered. "About" renders as
// the last item of the "Help" category group (it's a real link out, not a
// tab with inline content, but it belongs with Tutorials conceptually, not
// off on its own). "Sign out" stays below everything, uncategorized — it's
// an action, not a setting.
function DesktopSettingsNav({ activeTab, onSelect }: { activeTab: TabId; onSelect: (tab: TabId) => void }) {
  return (
    <nav className="sticky top-6 hidden w-56 shrink-0 flex-col gap-1 self-start glass-surface p-2 lg:flex">
      {groupedTabs().map((group, i) => (
        <div key={group.category}>
          <CategoryHeading category={group.category} isFirst={i === 0} />
          <div className="flex flex-col gap-1">
            {group.tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => onSelect(tab.id)}
                className={`flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left text-small transition ${
                  activeTab === tab.id
                    ? "border-transparent bg-[rgb(var(--signal)/0.14)] text-signal"
                    : "border-transparent text-slate-400 hover:bg-slate-800/60 hover:text-slate-200"
                }`}
              >
                <TabIcon path={tab.icon} />
                {tab.label}
              </button>
            ))}
            {group.category === "Help" && <AboutLink />}
          </div>
        </div>
      ))}
      <div className="my-1 h-px bg-ink/10" />
      <SignOutButton />
    </nav>
  );
}

// Below lg — a plain menu list, grouped under the same category headings as
// the desktop nav, no content shown until tapped. Each row pushes a
// full-screen SlideOverPanel instead of swapping content in place. Sign out
// stays bottom-pinned, always last, same reasoning as the desktop nav.
function MobileSettingsMenu({ onSelect }: { onSelect: (tab: TabId) => void }) {
  return (
    <div className="glass-surface lg:hidden">
      {groupedTabs().map((group, i) => (
        <div key={group.category} className={i === 0 ? "" : "border-t border-ink/10 pt-1"}>
          <p
            className={`px-4 pb-1 pt-3 text-small font-semibold uppercase tracking-[0.16em] ${
              group.category === "Danger zone" ? "text-red-400/70" : "text-slate-500"
            }`}
          >
            {group.category}
          </p>
          <div className="divide-y divide-ink/10">
            {group.tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => onSelect(tab.id)}
                className="flex w-full items-center gap-3 px-4 py-4 text-left transition hover:bg-ink/5"
              >
                <TabIcon path={tab.icon} className="h-5 w-5 shrink-0 text-slate-400" />
                <span className="flex-1 text-small text-slate-100">{tab.label}</span>
                <TabIcon path={TAB_ICONS.chevron} className="h-4 w-4 shrink-0 text-slate-500" />
              </button>
            ))}
            {group.category === "Help" && (
              <Link href="/about" className="flex w-full items-center gap-3 px-4 py-4 text-left transition hover:bg-ink/5">
                <TabIcon path={TAB_ICONS.about} className="h-5 w-5 shrink-0 text-slate-400" />
                <span className="flex-1 text-small text-slate-100">About</span>
                <TabIcon path={TAB_ICONS.chevron} className="h-4 w-4 shrink-0 text-slate-500" />
              </Link>
            )}
          </div>
        </div>
      ))}
      <div className="border-t border-ink/10">
        <SignOutButton className="w-full rounded-none px-4 py-4 hover:bg-ink/5" />
      </div>
    </div>
  );
}

function TabContent({
  tab,
  hasCurriculumAccess,
  initialNotificationPreferences,
  assistantHistory,
  activePlan,
}: {
  tab: TabId;
  hasCurriculumAccess: boolean;
  initialNotificationPreferences: NotificationPreferencesInput;
  assistantHistory: AssistantMessage[];
  activePlan: ActivePlanInfo | null;
}) {
  if (tab === "notifications") return <NotificationSettingsSection initial={initialNotificationPreferences} />;
  if (tab === "membership") return <MembershipSection hasCurriculumAccess={hasCurriculumAccess} activePlan={activePlan} />;
  if (tab === "appearance") return <AppearanceSection />;
  if (tab === "tutorials") return <TutorialsSection />;
  if (tab === "privacy") return <PrivacySection history={assistantHistory} />;
  if (tab === "danger") return <DangerZoneSection />;
  return <PasswordSection />;
}

// Atom's live chat window always opens on a clean slate now (see
// AssistantWidget.tsx). This is where the actual saved history lives
// instead. Read-only: it ages out on its own after 30 days
// (pruneStaleAssistantHistory in assistant.ts), so there's no self-service
// clear-now button here, just a pointer to messaging the studio for anyone
// who wants it gone sooner.
function PrivacySection({ history }: { history: AssistantMessage[] }) {
  return (
    <SectionCard title="Privacy & data" description="What's saved about your conversations, and where to go for the rest.">
      <div>
        <h3 className="text-small font-medium text-slate-200">History → Atom</h3>
        <p className="mt-1 text-small text-slate-500">
          Atom&apos;s chat window always opens fresh, but everything you&apos;ve asked it while signed in is kept here for 30
          days, then deleted on its own: {history.length} message{history.length === 1 ? "" : "s"} right now.
        </p>
        <div className="mt-3 max-h-96 space-y-2 overflow-y-auto rounded-xl border border-ink/10 p-3">
          {history.length === 0 ? (
            <p className="py-6 text-center text-small text-slate-600">
              Nothing here yet. Questions you ask Atom while signed in will show up here.
            </p>
          ) : (
            history.map((message, index) => (
              <div
                key={index}
                className={`rounded-lg px-3 py-2 text-small ${
                  message.role === "user" ? "ml-8 bg-[rgb(var(--c-s-50)/0.12)] text-slate-100" : "mr-8 bg-slate-900 text-slate-300"
                }`}
              >
                <p className="mb-0.5 font-medium text-slate-500">{message.role === "user" ? "You" : "Atom"}</p>
                <p className="whitespace-pre-wrap">{message.content}</p>
              </div>
            ))
          )}
        </div>
        <p className="mt-3 text-small text-slate-500">
          Want it gone sooner than 30 days? Message us directly through the app. See the{" "}
          <Link href="/privacy" className="underline underline-offset-2 text-[rgb(var(--c-s-50))] hover:opacity-70">
            Privacy policy
          </Link>{" "}
          for how deletion works.
        </p>
      </div>
    </SectionCard>
  );
}

function AppearanceSection() {
  return (
    <section>
      <h2 className="text-body text-slate-50 font-semibold">Themes &amp; appearance</h2>
      <p className="mt-1.5 text-small text-slate-500">
        Change how Bass Note Piano looks for you. Nothing here affects what anyone else sees.
      </p>
      <div className="mt-6">
        <ThemePicker />
      </div>
    </section>
  );
}

function AccountSettingsInner({
  hasCurriculumAccess,
  initialNotificationPreferences,
  assistantHistory,
  activePlan,
}: AccountSettingsProps) {
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
    <>
      <SettingsLayout
        header={
          <div>
            <p className="text-small font-medium uppercase tracking-[0.2em] text-[rgb(var(--c-s-50)/0.8)]">Settings</p>
            <h1 className="font-hero text-hero font-bold text-balance mt-1.5 text-slate-50">Account</h1>
            <p className="mt-1 text-small text-slate-500">
              Want to edit your name, username, or photo? Head to{" "}
              <Link href="/profile" className="underline underline-offset-2 text-[rgb(var(--c-s-50))] hover:opacity-70">
                your profile
              </Link>
              .
            </p>
          </div>
        }
        menu={
          <>
            <DesktopSettingsNav activeTab={activeTab} onSelect={selectDesktopTab} />
            <MobileSettingsMenu onSelect={openMobileTab} />
          </>
        }
      >
        <div className="hidden min-w-0 flex-1 space-y-6 lg:block">
          <TabContent
            tab={activeTab}
            hasCurriculumAccess={hasCurriculumAccess}
            initialNotificationPreferences={initialNotificationPreferences}
            assistantHistory={assistantHistory}
            activePlan={activePlan}
          />
        </div>
      </SettingsLayout>

      <SlideOverPanel
        open={mobileOpenTab !== null}
        onClose={() => setMobileOpenTab(null)}
        title={mobileOpenTab ? TABS.find((t) => t.id === mobileOpenTab)!.label : ""}
      >
        {mobileOpenTab && (
          <TabContent
            tab={mobileOpenTab}
            hasCurriculumAccess={hasCurriculumAccess}
            initialNotificationPreferences={initialNotificationPreferences}
            assistantHistory={assistantHistory}
            activePlan={activePlan}
          />
        )}
      </SlideOverPanel>
    </>
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
  activePlan,
}: {
  hasCurriculumAccess: boolean;
  activePlan: ActivePlanInfo | null;
}) {
  return (
    <div className="space-y-6">
      <SectionCard title="Membership & purchases" description="Your curriculum and payment history.">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink/10 p-4">
          <div>
            <p className="text-small text-slate-100">{hasCurriculumAccess ? "Curriculum included" : "No active class plan"}</p>
            <p className="mt-0.5 text-small text-slate-500">
              {hasCurriculumAccess
                ? "The curriculum comes with your live classes. Your teacher opens each new scale as you progress."
                : "The curriculum comes with live classes. Start a plan to unlock it."}
            </p>
          </div>
          {!hasCurriculumAccess && (
            <Link href="/billing/plans" className="cta-sheen cta-fill rounded-lg px-4 py-2 text-small font-semibold">
              See class plans
            </Link>
          )}
        </div>

        <Link
          href="/billing/history"
          className="mt-3 flex items-center justify-between rounded-xl border border-ink/10 p-4 text-small text-slate-200 transition hover:border-[rgb(var(--c-s-50)/0.3)] hover:text-[rgb(var(--c-s-50))]"
        >
          Payment history
          <span className="text-slate-500">→</span>
        </Link>
      </SectionCard>

      <SectionCard
        title="Manage subscriptions"
        description="Your weekly class plan: switch terms, or cancel. The family bundle is here too, for buying a term for 2 or more kids."
      >
        <ManageSubscriptions
          activePlan={activePlan}
          onChangeTerm={changePaymentPlanTermAction}
          onCancel={cancelPaymentPlanBySelfAction}
        />
      </SectionCard>
    </div>
  );
}

// Matches actions.ts's own constant of the same name (and the auth pages').
const MIN_PASSWORD_LENGTH = 8;

function PasswordSection() {
  const { update } = useSession();
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

    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
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
    // The password change just bumped sessionVersion so every OTHER open
    // session gets signed out (see updatePasswordAction) — update() forces
    // this device's own JWT to re-stamp against the new value right now,
    // rather than waiting for its next natural refresh, so it isn't
    // accidentally caught by the same check.
    await update();
  }

  return (
    <div className="space-y-6">
      <SectionCard title="Password" description="Changing it signs out any other devices you're currently signed in on.">
        <form onSubmit={handleSubmit} className="space-y-3">
          <PasswordInput
            placeholder="Current password"
            autoComplete="current-password"
            required
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            disabled={submitting}
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
              disabled={submitting}
              className="w-full disabled:opacity-60"
            />
            {newPassword.length > 0 && (
              <p className={`mt-1.5 flex items-center gap-1.5 text-small ${newPassword.length >= MIN_PASSWORD_LENGTH ? "text-slate-50" : "text-slate-500"}`}>
                <CheckIcon size={11} className={newPassword.length >= MIN_PASSWORD_LENGTH ? "opacity-100" : "opacity-30"} />
                At least {MIN_PASSWORD_LENGTH} characters
              </p>
            )}
          </div>
          <div>
            <PasswordInput
              placeholder="Confirm new password"
              autoComplete="new-password"
              required
              minLength={MIN_PASSWORD_LENGTH}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={submitting}
              className="w-full disabled:opacity-60"
            />
            {confirmPassword.length > 0 && (
              <p className={`mt-1.5 flex items-center gap-1.5 text-small ${newPassword === confirmPassword ? "text-slate-50" : "text-slate-500"}`}>
                <CheckIcon size={11} className={newPassword === confirmPassword ? "opacity-100" : "opacity-30"} />
                {newPassword === confirmPassword ? "Passwords match" : "Passwords don't match yet"}
              </p>
            )}
          </div>

          {error && <p className="text-small text-red-400">{error}</p>}
          {success && <p className="text-small text-slate-50">Password updated. Other devices have been signed out.</p>}

          <button
            type="submit"
            disabled={submitting}
            className="cta-sheen cta-fill flex w-full items-center justify-center rounded-lg py-2 text-small font-semibold disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting && <MorphingSquare size={12} className="mr-1.5 shrink-0" />}
            {submitting ? "Saving…" : "Change password"}
          </button>
        </form>
      </SectionCard>

      <SignOutOtherDevicesCard />
    </div>
  );
}

// Standalone, on-demand version of what a password change now also does —
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
  }

  return (
    <SectionCard
      title="Sign out of other devices"
      description="If you're signed in somewhere you don't recognize, or just used a shared computer, this ends every session except this one."
    >
      <button
        type="button"
        onClick={handleClick}
        disabled={submitting}
        className="flex items-center justify-center rounded-lg border border-ink/10 px-4 py-2 text-small font-medium text-slate-200 transition hover:border-[rgb(var(--c-s-50)/0.4)] hover:text-[rgb(var(--c-s-50))] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting && <MorphingSquare size={12} className="mr-1.5 shrink-0" />}
        {submitting ? "Signing out other devices…" : "Sign out of all other devices"}
      </button>
      {success && !submitting && <p className="mt-3 text-small text-slate-50">Done. This device stays signed in.</p>}
    </SectionCard>
  );
}

// Three stages: the button sits alone until clicked (nothing pre-filled,
// nothing pre-triggered), then a password field + "send code" button, then
// — once a code has actually been emailed — the code field, the explicit
// confirmation checkbox, and the real delete button. Password and code are
// both re-checked server-side on the final submit regardless of what this
// component thinks already happened (see confirmAccountDeletionAction).
function DangerZoneSection() {
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
    // The account row is already gone server-side — this just clears the
    // browser's session cookie and leaves. Not setDeleting(false): there's
    // nothing left to re-enable a form for.
    await signOut({ callbackUrl: "/" });
  }

  return (
    <SectionCard title="Danger zone" description="Permanently delete your account and everything tied to it.">
      <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4">
        <p className="text-small text-slate-200">
          This deletes your profile, curriculum progress, class bookings, credits, messages, and everything else tied
          to your account.
        </p>
        <p className="mt-1.5 text-small font-medium text-red-300">
          This can&apos;t be undone. Once your data is deleted there is no way to get it back — not even by
          contacting us.
        </p>

        {stage === "idle" && (
          <button
            type="button"
            onClick={() => setStage("password")}
            className="mt-4 rounded-lg bg-red-600 px-4 py-2 text-small font-semibold text-white transition hover:bg-red-500"
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
                className="flex-1 rounded-lg border border-ink/10 py-2 text-small font-medium text-slate-300 transition hover:bg-slate-800 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={sendingCode || !password}
                className="flex flex-1 items-center justify-center rounded-lg bg-red-600 py-2 text-small font-semibold text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
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
              We emailed a 6-digit code to your account&apos;s email address. It expires in 10 minutes.
            </p>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="6-digit code"
              maxLength={6}
              autoFocus
              required
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              disabled={deleting}
              className="w-full glass-surface-subtle px-3 py-2 text-center text-body tracking-[0.4em] text-slate-100 outline-none transition focus:border-red-400/60 disabled:opacity-60"
            />
            <label className="flex items-start gap-2 text-small text-slate-400">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                disabled={deleting}
                className="mt-0.5 accent-red-500"
              />
              I understand this permanently deletes my account and everything in it, and can&apos;t be undone.
            </label>
            {error && <p className="text-small text-red-400">{error}</p>}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={reset}
                disabled={deleting}
                className="flex-1 rounded-lg border border-ink/10 py-2 text-small font-medium text-slate-300 transition hover:bg-slate-800 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={deleting || !confirmed || code.length !== 6}
                className="flex flex-1 items-center justify-center rounded-lg bg-red-600 py-2 text-small font-semibold text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
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

function TutorialsSection() {
  const router = useRouter();
  return (
    <SectionCard title="Tutorials" description="Replay the app walkthrough — the same spotlight tour shown once when you first joined.">
      <p className="text-small text-slate-400">
        A quick tour of the roadmap, online lessons, friends, messages, notifications, your profile, and settings —
        with a &quot;Skip tour&quot; option on every step if you want out early.
      </p>
      <button
        type="button"
        onClick={() => router.push("/dashboard?tour=1")}
        className="cta-sheen cta-fill mt-4 rounded-lg px-4 py-2 text-small font-semibold"
      >
        Replay app tour
      </button>
    </SectionCard>
  );
}

const NOTIFICATION_TOGGLES: { key: keyof NotificationPreferencesInput; label: string; description: string }[] = [
  {
    key: "notifyEmailPayments",
    label: "Payment approvals",
    description: "Zelle payments verified or rejected, plus payment plan installment invoices and reminders.",
  },
  { key: "notifyEmailRoleUpdates", label: "Role updates", description: "Granted Admin access." },
  { key: "notifyEmailSocial", label: "Social", description: "Friend requests and new messages." },
  {
    key: "notifyEmailReminders",
    label: "Practice reminders",
    description: "Nudges after a few days away. Off means off — no bell, no email.",
  },
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
    <SectionCard
      title="Notification settings"
      description="Payments, role updates, and social always show in the bell — choose which also send an email. Practice reminders can be muted completely."
    >
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

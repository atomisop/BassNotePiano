"use client";

import { AdminTwoStepCard } from "./AdminTwoStepCard";
import { MIN_PASSWORD_LENGTH, passwordRequirementError } from "@/lib/passwordRules";
import { PasswordStrength } from "@/components/ui/password-strength";
import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Laptop, Smartphone, Tablet } from "lucide-react";
import { signOut, useSession } from "next-auth/react";
import { SlideOverPanel } from "@/components/layout/SlideOverPanel";
import { ThemePicker } from "@/components/theme/ThemePicker";
import { Switch } from "@/components/ui/switch";
import { PasswordInput } from "@/components/ui/password-input";
import { CheckIcon } from "@/components/ui/icons";
import { MorphingSquare } from "@/components/ui/morphing-square";
import { ManageSubscriptions, type ActivePlanInfo } from "@/components/account/ManageSubscriptions";
import { PausePlanCard } from "@/components/account/PausePlanCard";
import { AddToHomeSteps, isStandalone } from "@/components/pwa/AddToHomeSteps";
import type { AssistantMessage } from "@/lib/assistant";
import {
  updatePasswordAction,
  requestPasswordChangeCodeAction,
  signOutOtherDevicesAction,
  listSignedInDevicesAction,
  type SignedInDevice,
  updateNotificationPreferencesAction,
  requestAccountDeletionCodeAction,
  confirmAccountDeletionAction,
  changePaymentPlanTermAction,
  cancelPaymentPlanBySelfAction,
  pausePaymentPlanAction,
  type NotificationPreferencesInput,
} from "./actions";
import { SettingsLayout } from "@/components/layout/PageLayouts";
import { startNavigation } from "@/lib/navigationState";
import { PhoneCard, type PhoneState } from "@/components/account/PhoneCard";
import { formatPhone } from "@/lib/phone";
import { unlinkDiscordAction } from "../lessons/discordActions";
import { buttonVariants } from "@/components/ui/button";
import { DiscordConnectLink } from "@/components/ui/DiscordLink";
import { announceChange } from "@/lib/liveEvents";

/** What the Account section shows about the person. Plain data, chosen on the server. */
export interface AccountOverview {
  name: string | null;
  username: string | null;
  email: string;
  emailVerified: boolean;
  /** ISO date the account was made. */
  createdAt: string;
  phone: PhoneState;
  discordUsername: string | null;
}

interface AccountSettingsProps {
  account: AccountOverview;
  hasCurriculumAccess: boolean;
  initialNotificationPreferences: NotificationPreferencesInput;
  assistantHistory: AssistantMessage[];
  activePlan: ActivePlanInfo | null;
  /** Set for the admin only (students never see two-step sign-in). */
  twoStep: { enabled: boolean; backupLeft: number } | null;
}

const TAB_ICONS = {
  account: "M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0",
  notifications:
    "M12 3a5 5 0 00-5 5v2.7c0 .57-.19 1.13-.53 1.58L5 14.5c-.94 1.24-.06 3 1.49 3h11.02c1.55 0 2.43-1.76 1.49-3l-1.47-2.22a2.67 2.67 0 01-.53-1.58V8a5 5 0 00-5-5zM9.5 19.5a2.5 2.5 0 005 0",
  membership: "M3 8h18M3 6h18v12a1 1 0 01-1 1H4a1 1 0 01-1-1V6zM7 15h4",
  password: "M12 15v2M6 10V7a6 6 0 1112 0v3M5 10h14v10a1 1 0 01-1 1H6a1 1 0 01-1-1V10z",
  tutorials: "M12 21a9 9 0 100-18 9 9 0 000 18zM12 7v5l3 3",
  appearance:
    "M12 3a9 9 0 000 18c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1-.24-.27-.39-.62-.39-1 0-.83.67-1.5 1.5-1.5H16a5 5 0 005-5c0-4.42-4.03-8-9-8zM7.5 11a1 1 0 100-2 1 1 0 000 2zm3-3a1 1 0 100-2 1 1 0 000 2zm5 0a1 1 0 100-2 1 1 0 000 2z",
  chevron: "M9 18l6-6-6-6",
  shop: "M6 7h12l-1 12a1 1 0 01-1 1H8a1 1 0 01-1-1L6 7zM9 7a3 3 0 016 0",
  about: "M12 21a9 9 0 100-18 9 9 0 000 18zM12 11v5M12 7.5h.01",
  logout: "M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9",
  danger: "M4 7h16M9 7V5a2 2 0 012-2h2a2 2 0 012 2v2m3 0-1 12a2 2 0 01-2 2H8a2 2 0 01-2-2L5 7h14z",
  privacy: "M12 3l7 3v5c0 5-3.5 8.5-7 10-3.5-1.5-7-5-7-10V6l7-3z",
} as const;

// Grouped into defined categories rather than one flat list, order here is
// render order, so entries in the same category stay adjacent. "Danger
// zone" is its own category rather than folded into "Account & security" on
// purpose: a destructive action should never blend visually into routine
// settings.
const TABS = [
  { id: "account", label: "Account", icon: TAB_ICONS.account, category: "Account" },
  { id: "notifications", label: "Notifications", icon: TAB_ICONS.notifications, category: "Preferences" },
  { id: "appearance", label: "Themes & Appearance", icon: TAB_ICONS.appearance, category: "Preferences" },
  { id: "membership", label: "Membership & Purchases", icon: TAB_ICONS.membership, category: "Billing" },
  { id: "tutorials", label: "Tutorials", icon: TAB_ICONS.tutorials, category: "Help" },
] as const;

// Password, privacy and delete used to be tabs of their own. They are groups inside Account now, so old
// links and bookmarks that still ask for them land there.
const LEGACY_TABS: Record<string, "account"> = { password: "account", privacy: "account", danger: "account" };

type TabId = (typeof TABS)[number]["id"];
type Category = (typeof TABS)[number]["category"];

/** Groups TABS by category, preserving the array's own order, no re-sort,
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

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="glass-surface p-6">
      <h2 className="text-body text-slate-50 font-semibold">{title}</h2>
      <div className="mt-4">{children}</div>
    </div>
  );
}

// lg+ only, a sticky always-visible nav beside the inline content, since
// there's room for both without it feeling cluttered.
// Not a tab (nothing appears inline for it), a real link out to the
// existing `/about` page, which is its own substantial tabbed page
// (About/Update notes/Terms). Styled to match the tab buttons above it so
// it reads as part of the same list.
function ShopLink({ back }: { back: string }) {
  return (
    <Link
      href={`/shop?back=${encodeURIComponent(back)}`}
      className={buttonVariants({ variant: "outline", className: "text-left" })}
    >
      <TabIcon path={TAB_ICONS.shop} />
      Shop
    </Link>
  );
}

function AboutLink() {
  return (
    <Link
      href="/about"
      className={buttonVariants({ variant: "outline", className: "text-left" })}
    >
      <TabIcon path={TAB_ICONS.about} />
      About
    </Link>
  );
}

// Same subdued styling the old Sidebar's sign-out button used, an action,
// not a destructive-red warning.
function SignOutButton({ className = "" }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={() => {
        startNavigation();
        void signOut({ callbackUrl: "/" });
      }}
      className={`tap flex items-center gap-2.5 rounded-xl border border-transparent px-3 py-2.5 text-left text-small text-slate-400 transition hover:text-slate-200 hover:shadow-raised-low active:shadow-pressed-low ${className}`}
    >
      <TabIcon path={TAB_ICONS.logout} />
      Sign out
    </button>
  );
}

// Small uppercase divider between groups, text-slate-500, not -600: -600
// fails AA (4.5:1) for real text on this ground (see the accessibility
// pass's SiteFooter comment), and a category label is real text a sighted
// user reads to understand the grouping, not decoration.
function CategoryHeading({ category, isFirst }: { category: Category; isFirst: boolean }) {
  return (
    <p
      className={`px-3 pb-1 text-small font-semibold uppercase tracking-[0.16em] text-slate-500 ${isFirst ? "" : "mt-3"}`}
    >
      {category}
    </p>
  );
}

// lg+ only, a sticky always-visible nav beside the inline content, since
// there's room for both without it feeling cluttered. "About" renders as
// the last item of the "Help" category group (it's a real link out, not a
// tab with inline content, but it belongs with Tutorials conceptually, not
// off on its own). "Sign out" stays below everything, uncategorized, it's
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
                    ? "border-transparent bg-neu-base text-signal-fg shadow-pressed-low"
                    : "border-transparent text-slate-400 hover:text-slate-200 hover:shadow-raised-low active:shadow-pressed-low"
                }`}
              >
                <TabIcon path={tab.icon} />
                {tab.label}
              </button>
            ))}
            {group.category === "Help" && (
              <>
                <ShopLink back={`/account?tab=${activeTab}`} />
                <AboutLink />
              </>
            )}
          </div>
        </div>
      ))}
      <div className="my-1 h-px bg-ink/10" />
      <SignOutButton />
    </nav>
  );
}

// Below lg, a plain menu list, grouped under the same category headings as
// the desktop nav, no content shown until tapped. Each row pushes a
// full-screen SlideOverPanel instead of swapping content in place. Sign out
// stays bottom-pinned, always last, same reasoning as the desktop nav.
function MobileSettingsMenu({ onSelect }: { onSelect: (tab: TabId) => void }) {
  // Each category is its own raised card; every icon sits in a small pressed
  // well. Rows press in on tap so the list reads as physical buttons.
  const row = "tap flex w-full items-center gap-3 px-4 py-3 text-left transition active:shadow-pressed-low";
  const well = "flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-neu-base text-slate-400 shadow-pressed-low";
  return (
    <div className="space-y-5 lg:hidden">
      {groupedTabs().map((group) => (
        <section key={group.category}>
          <p
            className="px-1 pb-2 text-small font-semibold uppercase tracking-[0.16em] text-slate-500"
          >
            {group.category}
          </p>
          <div className="divide-y divide-ink/10 overflow-hidden rounded-2xl bg-neu-base shadow-raised-low">
            {group.tabs.map((tab) => (
              <button key={tab.id} type="button" onClick={() => onSelect(tab.id)} className={row}>
                <span className={`${well} `}>
                  <TabIcon path={tab.icon} />
                </span>
                <span className="flex-1 text-small text-slate-100">{tab.label}</span>
                <TabIcon path={TAB_ICONS.chevron} className="h-4 w-4 shrink-0 text-slate-500" />
              </button>
            ))}
            {group.category === "Help" && (
              <Link href={`/shop?back=${encodeURIComponent("/account")}`} className={row}>
                <span className={well}>
                  <TabIcon path={TAB_ICONS.shop} />
                </span>
                <span className="flex-1 text-small text-slate-100">Shop</span>
                <TabIcon path={TAB_ICONS.chevron} className="h-4 w-4 shrink-0 text-slate-500" />
              </Link>
            )}
            {group.category === "Help" && (
              <Link href="/about" className={row}>
                <span className={well}>
                  <TabIcon path={TAB_ICONS.about} />
                </span>
                <span className="flex-1 text-small text-slate-100">About</span>
                <TabIcon path={TAB_ICONS.chevron} className="h-4 w-4 shrink-0 text-slate-500" />
              </Link>
            )}
          </div>
        </section>
      ))}
      <div className="overflow-hidden rounded-2xl bg-neu-base shadow-raised-low">
        <SignOutButton className="w-full rounded-none px-4 py-3 hover:shadow-none active:shadow-pressed-low" />
      </div>
    </div>
  );
}

function TabContent({
  tab,
  account,
  hasCurriculumAccess,
  initialNotificationPreferences,
  assistantHistory,
  activePlan,
  twoStep,
}: {
  tab: TabId;
  account: AccountOverview;
  hasCurriculumAccess: boolean;
  initialNotificationPreferences: NotificationPreferencesInput;
  assistantHistory: AssistantMessage[];
  activePlan: ActivePlanInfo | null;
  twoStep: AccountSettingsProps["twoStep"];
}) {
  if (tab === "notifications") return <NotificationSettingsSection initial={initialNotificationPreferences} />;
  if (tab === "membership") return <MembershipSection hasCurriculumAccess={hasCurriculumAccess} activePlan={activePlan} />;
  if (tab === "appearance") return <AppearanceSection />;
  if (tab === "tutorials") return <TutorialsSection />;
  return <AccountSection account={account} history={assistantHistory} twoStep={twoStep} />;
}

function AccountGroup({ id, title, blurb, danger, children }: { id: string; title: string; blurb?: string; danger?: boolean; children: React.ReactNode }) {
  return (
    <section data-account-group={id} className="scroll-mt-4 space-y-4">
      <div>
        <h2 className={`text-small font-semibold uppercase tracking-[0.16em] ${danger ? "text-[rgb(var(--c-rd-300))]" : "text-slate-400"}`}>{title}</h2>
        {blurb && <p className="mt-1 text-small text-slate-500">{blurb}</p>}
      </div>
      {children}
    </section>
  );
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <span className="text-small text-slate-500">{label}</span>
      <span className="min-w-0 text-right text-small text-slate-100">{children}</span>
    </div>
  );
}

function Badge({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <span className={`ml-2 rounded-full px-2 py-0.5 text-small font-medium ${ok ? "bg-[rgb(var(--signal)/0.16)] text-signal-fg" : "bg-slate-700/60 text-slate-300"}`}>{children}</span>
  );
}

function DiscordAccountCard({ username }: { username: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <SectionCard title="Discord">
      <p className="text-small text-slate-500">
        Live classes happen in a private Discord call. Connecting gives you access to yours.
      </p>
      <p className="mt-3 text-small text-slate-100">
        {username ? (
          <>
            Connected as <span className="font-semibold">{username}</span>
          </>
        ) : (
          "Not connected"
        )}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <DiscordConnectLink className={buttonVariants({ variant: "secondary", size: "sm" })}>
          {username ? "Reconnect" : "Connect Discord"}
        </DiscordConnectLink>
        {username && (
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              if (!window.confirm("Disconnect Discord? You will not be added to your class calls until you connect again.")) return;
              setBusy(true);
              await unlinkDiscordAction();
              setBusy(false);
              router.refresh();
              announceChange("status");
            }}
            className={buttonVariants({ variant: "secondary", size: "sm" })}
          >
            Disconnect
          </button>
        )}
      </div>
    </SectionCard>
  );
}

const ACCOUNT_JUMPS = [
  { id: "profile", label: "Profile" },
  { id: "contact", label: "Contact" },
  { id: "security", label: "Sign-in & security" },
  { id: "connections", label: "Connected accounts" },
  { id: "privacy", label: "Privacy & data" },
  { id: "danger", label: "Delete account" },
] as const;

// Everything about the person and their sign-in, in one place and in groups, so nothing account-related is
// scattered across tabs: who you are, how we reach you, how you sign in, what is connected, what we keep, and
// the one irreversible action last.
function AccountSection({ account, history, twoStep }: { account: AccountOverview; history: AssistantMessage[]; twoStep: AccountSettingsProps["twoStep"] }) {
  // Looked up inside this copy only: Settings renders the section twice (desktop column, phone panel), so ids would clash.
  const root = useRef<HTMLDivElement>(null);
  return (
    <div ref={root} className="space-y-10">
      <div className="flex flex-wrap gap-1.5" role="navigation" aria-label="Jump to a group">
        {ACCOUNT_JUMPS.map((j) => (
          <button
            key={j.id}
            type="button"
            onClick={() => root.current?.querySelector(`[data-account-group="${j.id}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" })}
            className="tap rounded-full bg-neu-base px-3 py-1.5 text-small font-medium text-slate-300 shadow-raised-low transition hover:text-slate-100 active:shadow-pressed-low"
          >
            {j.label}
          </button>
        ))}
      </div>

      <AccountGroup id="profile" title="Profile">
        <SectionCard title="Your account">
          <div className="divide-y divide-ink/10">
            <InfoRow label="Name">{account.name ?? "Not set"}</InfoRow>
            <InfoRow label="Username">{account.username ? `@${account.username}` : "Not set"}</InfoRow>
            <InfoRow label="Member since">{new Date(account.createdAt).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}</InfoRow>
          </div>
          <Link href="/profile" className={buttonVariants({ variant: "secondary", size: "sm", className: "mt-3" })}>
            Edit name, photo and music profile
          </Link>
        </SectionCard>
      </AccountGroup>

      <AccountGroup id="contact" title="Contact" blurb="How we reach you, and how we know it is you.">
        <SectionCard title="Email address">
          <div className="flex flex-wrap items-center">
            <span className="text-small text-slate-100">{account.email}</span>
            <Badge ok={account.emailVerified}>{account.emailVerified ? "Verified" : "Not verified"}</Badge>
          </div>
          <p className="mt-2 text-small text-slate-500">Sign-in codes, receipts and class reminders go here. To change it, message the studio from the Messages tab.</p>
        </SectionCard>
        <PhoneCard state={account.phone} />
      </AccountGroup>

      <AccountGroup id="security" title="Sign-in & security" blurb="Your password, and where you are signed in.">
        <PasswordSection />
        {twoStep && <AdminTwoStepCard enabled={twoStep.enabled} backupLeft={twoStep.backupLeft} />}
      </AccountGroup>

      <AccountGroup id="connections" title="Connected accounts">
        <DiscordAccountCard username={account.discordUsername} />
      </AccountGroup>

      <AccountGroup id="privacy" title="Privacy & data" blurb="What we keep, and getting a copy of it.">
        <PrivacySection history={history} />
        <SectionCard title="Download my data">
          <p className="text-small text-slate-500">
            A copy of your account details, classes, payments, progress and any teacher notes shared with you, as one file.
          </p>
          <a href="/api/account/export" download className={buttonVariants({ variant: "secondary", size: "sm", className: "mt-3" })}>
            Download my data
          </a>
        </SectionCard>
      </AccountGroup>

      <AccountGroup id="danger" title="Delete account" danger>
        <DangerZoneSection />
      </AccountGroup>
    </div>
  );
}

// Atom's live chat window always opens on a clean slate now (see
// AssistantWidget.tsx). This is where the actual saved history lives
// instead. Read-only: it ages out on its own after 30 days
// (pruneStaleAssistantHistory in assistant.ts), so there's no self-service
// clear-now button here, just a pointer to messaging the studio for anyone
// who wants it gone sooner.
function PrivacySection({ history }: { history: AssistantMessage[] }) {
  return (
    <SectionCard title="Saved Atom conversations">
      <div>
        <h3 className="text-small font-medium text-slate-200">History → Atom</h3>
        <div className="mt-3 max-h-96 space-y-2 overflow-y-auto rounded-xl p-3 bg-neu-base shadow-raised-low">
          {history.length === 0 ? (
            <p className="py-6 text-center text-small text-slate-500">
              Nothing here yet. Questions you ask Atom while signed in will show up here.
            </p>
          ) : (
            history.map((message, index) => (
              <div
                key={index}
                className={`rounded-lg px-3 py-2 text-small ${
                  message.role === "user" ? "ml-8 bg-neu-base shadow-pressed-low text-slate-100" : "mr-8 bg-neu-base shadow-raised-low text-slate-300"
                }`}
              >
                <p className="mb-0.5 font-medium text-slate-500">{message.role === "user" ? "You" : "Atom"}</p>
                <p className="whitespace-pre-wrap">{message.content}</p>
              </div>
            ))
          )}
        </div>
        <p className="mt-3 text-small text-slate-500">
          <Link href="/privacy" className="underline underline-offset-2 text-[rgb(var(--c-s-50))] hover:opacity-70">
            Privacy policy
          </Link>
        </p>
      </div>
    </SectionCard>
  );
}

function AppearanceSection() {
  return (
    <section>
      <h2 className="text-body text-slate-50 font-semibold">Themes &amp; appearance</h2>
      <div className="mt-6">
        <ThemePicker />
      </div>
    </section>
  );
}

function AccountSettingsInner({
  account,
  hasCurriculumAccess,
  initialNotificationPreferences,
  assistantHistory,
  activePlan,
  twoStep,
}: AccountSettingsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const initialTab: TabId = TABS.some((t) => t.id === requestedTab) ? (requestedTab as TabId) : (requestedTab && LEGACY_TABS[requestedTab]) || "account";
  const [activeTab, setActiveTab] = useState<TabId>(initialTab);
  const [mobileOpenTab, setMobileOpenTab] = useState<TabId | null>(null);

  // Deep links (e.g. the notification bell's "Notification settings" link)
  // land here with ?tab= set, on a narrow screen that should open the
  // slide-over panel directly instead of silently doing nothing, since the
  // menu list below shows no content on its own.
  useEffect(() => {
    if (!requestedTab) return;
    const target: TabId | undefined = TABS.some((t) => t.id === requestedTab) ? (requestedTab as TabId) : LEGACY_TABS[requestedTab];
    if (!target) return;
    if (window.matchMedia("(max-width: 1023px)").matches) {
      setMobileOpenTab(target);
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
            <p className="text-small font-medium uppercase tracking-[0.2em] text-[rgb(var(--c-s-50)/0.8)]">Yours to control</p>
            <h1 className="font-hero text-hero font-bold text-balance mt-1.5 text-slate-50">Settings</h1>
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
            account={account}
            hasCurriculumAccess={hasCurriculumAccess}
            initialNotificationPreferences={initialNotificationPreferences}
            assistantHistory={assistantHistory}
            activePlan={activePlan}
            twoStep={twoStep}
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
            account={account}
            hasCurriculumAccess={hasCurriculumAccess}
            initialNotificationPreferences={initialNotificationPreferences}
            assistantHistory={assistantHistory}
            activePlan={activePlan}
            twoStep={twoStep}
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
      <SectionCard title="Membership & purchases">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl p-4 bg-neu-base shadow-raised-low">
          <div>
            <p className="text-small text-slate-100">{hasCurriculumAccess ? "Curriculum included" : "No active class plan"}</p>
          </div>
          {!hasCurriculumAccess && (
            <Link href="/billing/plans" className={buttonVariants({ variant: "primary", size: "sm" })}>
              See class plans
            </Link>
          )}
        </div>

        <Link
          href="/billing/plans"
          className="mt-3 flex items-center justify-between rounded-xl p-4 text-small text-slate-200 transition hover:text-[rgb(var(--c-s-50))] bg-neu-base shadow-raised-low"
        >
          Payment plan
          <span className="text-slate-500">→</span>
        </Link>

        <Link
          href="/billing/history"
          className="mt-3 flex items-center justify-between rounded-xl p-4 text-small text-slate-200 transition hover:text-[rgb(var(--c-s-50))] bg-neu-base shadow-raised-low"
        >
          Payment history
          <span className="text-slate-500">→</span>
        </Link>
      </SectionCard>

      {activePlan && !activePlan.family && (
        <SectionCard title="Pause your plan">
          <PausePlanCard pausedAt={activePlan.pausedAt ?? null} pausedUntil={activePlan.pausedUntil ?? null} indefinite={activePlan.pausedIndefinitely ?? false} onPause={pausePaymentPlanAction} />
        </SectionCard>
      )}

      <SectionCard title="Manage membership">
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

function PasswordSection() {
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
              className="tap flex w-full items-center justify-center rounded-lg bg-neu-base py-2 text-small font-medium text-slate-300 shadow-raised-low transition hover:shadow-raised-mid active:shadow-pressed-low disabled:opacity-50"
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
  const [data, setData] = useState<{ link: string; joined: number; rewarded: number; percent: number; months: number } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/me/referral", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => alive && setData(d))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

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
    <SectionCard title="Invite a friend">
      <p className="text-small text-slate-400">
        Send your link. When your friend starts a 84 or 168 day plan and their first payment goes through, you both get {data.percent}% off for {data.months} months.
      </p>
      <label htmlFor="ref-link" className="sr-only">Your invite link</label>
      <input id="ref-link" readOnly value={data.link} onFocus={(e) => e.currentTarget.select()} className="mt-3 h-11 w-full rounded-lg bg-neu-base px-3 text-base text-slate-300 shadow-pressed-low outline-none focus-visible:ring-2 focus-visible:ring-ring" />
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
    <SectionCard title="Reminders on your phone">
      <p className="text-small text-slate-400">Get a push notification before a class and when it is time to practice, under the same reminder switches as email.</p>
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
    <SectionCard title="Your classes in your calendar">
      <p className="text-small text-slate-400">
        Subscribe once and every class you book shows up in Apple Calendar, Google Calendar or Outlook, and moves or disappears when you change it. Keep the link private: anyone who has it can see your class times.
      </p>
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
          <input id="cal-link" readOnly value={links.https} onFocus={(e) => e.currentTarget.select()} className="h-11 w-full rounded-lg bg-neu-base px-3 text-base text-slate-300 shadow-pressed-low outline-none focus-visible:ring-2 focus-visible:ring-ring" />
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
    <SectionCard title="Where you are signed in">
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
    <SectionCard title="Sign out of other devices">
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
    // The account row is already gone server-side, this just clears the
    // browser's session cookie and leaves. Not setDeleting(false): there's
    // nothing left to re-enable a form for.
    startNavigation();
    await signOut({ callbackUrl: "/" });
  }

  return (
    <SectionCard title="Danger zone">
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
                className="tap flex-1 rounded-lg py-2 text-small font-medium text-slate-300 transition disabled:opacity-50 bg-neu-base shadow-raised-low hover:shadow-raised-mid active:shadow-pressed-low"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={sendingCode || !password}
                className="tap flex flex-1 items-center justify-center rounded-lg bg-red-600 py-2 text-small font-semibold text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50 shadow-raised-low active:shadow-pressed-low hover:shadow-raised-mid"
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
                className="tap flex-1 rounded-lg py-2 text-small font-medium text-slate-300 transition disabled:opacity-50 bg-neu-base shadow-raised-low hover:shadow-raised-mid active:shadow-pressed-low"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={deleting || !confirmed || code.length !== 6}
                className="tap flex flex-1 items-center justify-center rounded-lg bg-red-600 py-2 text-small font-semibold text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50 shadow-raised-low active:shadow-pressed-low hover:shadow-raised-mid"
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
  const [installed, setInstalled] = useState(false);
  useEffect(() => setInstalled(isStandalone()), []);
  return (
    <>
      <SectionCard title="Tutorials">
        <button
          type="button"
          onClick={() => router.push("/dashboard?tour=1")}
          className={buttonVariants({ variant: "primary", className: "mt-4" })}
        >
          Replay app tour
        </button>
      </SectionCard>
      <SectionCard title="Add to your Home Screen">
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

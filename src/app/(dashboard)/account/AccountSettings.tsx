"use client";

import { AdminTwoStepCard } from "./AdminTwoStepCard";
import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { SlideOverPanel } from "@/components/layout/SlideOverPanel";
import { AppearanceTiles } from "@/components/theme/AppearanceTiles";
import { SolidSurfacesSwitch } from "@/components/theme/SolidSurfacesSwitch";
import { LeaderboardPrivacySwitch } from "@/components/home/LeaderboardPrivacySwitch";
import { ManageSubscriptions, type ActivePlanInfo } from "@/components/account/ManageSubscriptions";
import { PausePlanCard } from "@/components/account/PausePlanCard";
import type { AssistantMessage } from "@/lib/assistant";
import { changePaymentPlanTermAction, cancelPaymentPlanBySelfAction, pausePaymentPlanAction, type NotificationPreferencesInput } from "./actions";
import { SettingsLayout } from "@/components/layout/PageLayouts";
import { startNavigation } from "@/lib/navigationState";
import { PhoneCard, type PhoneState } from "@/components/account/PhoneCard";
import { unlinkDiscordAction } from "../lessons/discordActions";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DiscordConnectLink } from "@/components/ui/DiscordLink";
import { announceChange } from "@/lib/liveEvents";
import { Bell, ChevronRight, CreditCard, Info, KeyRound, Palette, PlayCircle, ShieldCheck, ShoppingBag, SignOut, Trash2, User, type AppIcon } from "@/components/ui/appIcons";
import { SectionCard } from "./SectionCard";
import { EmailChange } from "./EmailChange";
import {
  PasswordSection,
  DangerZoneSection,
  TutorialsSection,
  NotificationSettingsSection,
  ParentModeCard,
  ScholarshipCard,
  ReferralCard,
  PushCard,
  CalendarFeedCard,
  SignedInDevicesCard,
} from "./AccountSections";
import { Meta } from "@/components/ui/CardKit";
import { Hint } from "@/components/ui/Hint";
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
  /** They took themselves off the studio leaderboard. */
  leaderboardHidden: boolean;
  /** A child linked to a parent: never on the leaderboard, so there is nothing to switch. */
  leaderboardLinkedChild: boolean;
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
  account: User,
  notifications: Bell,
  membership: CreditCard,
  password: KeyRound,
  tutorials: PlayCircle,
  appearance: Palette,
  chevron: ChevronRight,
  shop: ShoppingBag,
  about: Info,
  logout: SignOut,
  danger: Trash2,
  privacy: ShieldCheck,
} satisfies Record<string, AppIcon>;

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
    // Appearance is not a screen of its own any more: its three choices sit right in the menu (AppearanceTiles). The tab stays for old links.
    if (tab.id === "appearance") continue;
    const last = groups[groups.length - 1];
    if (last && last.category === tab.category) {
      last.tabs.push(tab);
    } else {
      groups.push({ category: tab.category, tabs: [tab] });
    }
  }
  return groups;
}

function TabIcon({ icon: Icon, className = "h-[18px] w-[18px] shrink-0" }: { icon: AppIcon; className?: string }) {
  return <Icon className={className} />;
}


// lg+ only, a sticky always-visible nav beside the inline content, since
// there's room for both without it feeling cluttered.
// Not a tab (nothing appears inline for it), a real link out to the
// existing `/about` page, which is its own substantial tabbed page
// (About/Update notes/Terms). Styled to match the tab buttons above it so
// it reads as part of the same list.
// Every row in the desktop settings menu (tabs, Shop, About, Sign out) is the same shape; only the current one is filled.
const NAV_ROW =
  "tap flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-small font-medium text-slate-400 transition hover:bg-neu-lift hover:text-slate-100";
const NAV_ROW_ACTIVE = "tap flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-small font-medium bg-neu-lift text-slate-50";

function ShopLink({ back }: { back: string }) {
  return (
    <Link
      href={`/shop?back=${encodeURIComponent(back)}`}
      className={NAV_ROW}
    >
      <TabIcon icon={TAB_ICONS.shop} />
      Shop
    </Link>
  );
}

function AboutLink() {
  return (
    <Link
      href="/about"
      className={NAV_ROW}
    >
      <TabIcon icon={TAB_ICONS.about} />
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
      className={cn(NAV_ROW, className)}
    >
      <TabIcon icon={TAB_ICONS.logout} />
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
      className={`px-3 pb-1 text-small font-semibold uppercase tracking-caps text-slate-500 ${isFirst ? "" : "mt-3"}`}
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
                aria-current={activeTab === tab.id ? "page" : undefined}
                className={activeTab === tab.id ? NAV_ROW_ACTIVE : NAV_ROW}
              >
                <TabIcon icon={tab.icon} />
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
      <div className="mt-3">
        <p className="px-3 pb-1 text-small font-semibold uppercase tracking-caps text-slate-500">Appearance</p>
        <div className="px-2 pt-1 pb-2">
          <AppearanceTiles compact />
        </div>
      </div>
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
            className="px-1 pb-2 text-small font-semibold uppercase tracking-caps text-slate-500"
          >
            {group.category}
          </p>
          <div className="divide-y divide-ink/10 overflow-hidden rounded-2xl bg-neu-base shadow-raised-low">
            {group.tabs.map((tab) => (
              <button key={tab.id} type="button" onClick={() => onSelect(tab.id)} className={row}>
                <span className={`${well} `}>
                  <TabIcon icon={tab.icon} />
                </span>
                <span className="flex-1 text-small text-slate-100">{tab.label}</span>
                <TabIcon icon={TAB_ICONS.chevron} className="h-4 w-4 shrink-0 text-slate-500" />
              </button>
            ))}
            {group.category === "Help" && (
              <Link href={`/shop?back=${encodeURIComponent("/account")}`} className={row}>
                <span className={well}>
                  <TabIcon icon={TAB_ICONS.shop} />
                </span>
                <span className="flex-1 text-small text-slate-100">Shop</span>
                <TabIcon icon={TAB_ICONS.chevron} className="h-4 w-4 shrink-0 text-slate-500" />
              </Link>
            )}
            {group.category === "Help" && (
              <Link href="/about" className={row}>
                <span className={well}>
                  <TabIcon icon={TAB_ICONS.about} />
                </span>
                <span className="flex-1 text-small text-slate-100">About</span>
                <TabIcon icon={TAB_ICONS.chevron} className="h-4 w-4 shrink-0 text-slate-500" />
              </Link>
            )}
          </div>
        </section>
      ))}
      {/* Like the Claude app's settings: the look is chosen right here, three pictures, no screen of its own. */}
      <section>
        <p className="px-1 pb-2 text-small font-semibold uppercase tracking-caps text-slate-500">Appearance</p>
        <div className="rounded-2xl bg-neu-base p-4 shadow-raised-low">
          <AppearanceTiles />
        </div>
      </section>
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
  if (tab === "membership") return <MembershipSection activePlan={activePlan} />;
  if (tab === "appearance") return <AppearanceSection />;
  if (tab === "tutorials") return <TutorialsSection />;
  return <AccountSection account={account} history={assistantHistory} twoStep={twoStep} />;
}

function AccountGroup({ id, title, blurb, danger, children }: { id: string; title: string; blurb?: string; danger?: boolean; children: React.ReactNode }) {
  return (
    <section data-account-group={id} className="scroll-mt-4 space-y-4">
      <div>
        <h2 className={`text-small font-semibold uppercase tracking-caps ${danger ? "text-red-300" : "text-slate-400"}`}>{title}</h2>
        {blurb && <p className="mt-1 text-small text-slate-500">{blurb}</p>}
      </div>
      {children}
    </section>
  );
}

// Verified is the healthy state, so it is a quiet word; only "Not verified" carries a colour (DESIGN.md, Hierarchy 5).
function Badge({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return <span className={`ml-2 text-small ${ok ? "text-slate-500" : "font-medium text-amber-300"}`}>{children}</span>;
}

function DiscordAccountCard({ username }: { username: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <SectionCard title="Discord" value={username ? <>Connected as <span className="font-medium text-slate-100">{username}</span></> : "Not connected"}>
      <div className="flex flex-wrap gap-2">
        <DiscordConnectLink className={buttonVariants({ variant: username ? "ghost" : "primary", size: "sm", className: username ? "-ml-2" : undefined })}>
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
            className={buttonVariants({ variant: "ghost", size: "sm", className: "text-red-300 hover:text-red-200" })}
          >
            Disconnect
          </button>
        )}
      </div>
    </SectionCard>
  );
}

// Everything about the person and their sign-in, in one place and in groups, so nothing account-related is
// scattered across tabs: who you are, how we reach you, how you sign in, what is connected, what we keep, and
// the one irreversible action last.
function AccountSection({ account, history, twoStep }: { account: AccountOverview; history: AssistantMessage[]; twoStep: AccountSettingsProps["twoStep"] }) {
  return (
    <div className="space-y-10">
      <AccountGroup id="profile" title="Profile">
        <SectionCard title="Your account">
          {/* Who you are is the one bright line; the rest is a quiet meta line under it. */}
          <p className="break-words text-body font-semibold text-slate-50">{account.name ?? "No name yet"}</p>
          <Meta
            className="mt-0.5"
            items={[
              account.username ? `@${account.username}` : "No username",
              `Member since ${new Date(account.createdAt).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}`,
            ]}
          />
          <Link href="/profile" className={buttonVariants({ variant: "secondary", size: "sm", className: "mt-4" })}>
            Edit name, photo and music profile
          </Link>
        </SectionCard>
      </AccountGroup>

      <AccountGroup id="contact" title="Contact">
        <SectionCard title="Email address">
          <EmailChange currentEmail={account.email} verified={account.emailVerified} renderBadge={(ok) => <Badge ok={ok}>{ok ? "Verified" : "Not verified"}</Badge>} />
        </SectionCard>
        <PhoneCard state={account.phone} />
      </AccountGroup>

      {/* Sign-in only: the password, two-step (admins), and where you are signed in, which holds "sign out other devices" last. */}
      <AccountGroup id="security" title="Sign-in & security">
        <PasswordSection />
        {twoStep && <AdminTwoStepCard enabled={twoStep.enabled} backupLeft={twoStep.backupLeft} />}
        <SignedInDevicesCard />
      </AccountGroup>

      <AccountGroup id="connections" title="Connected accounts">
        <DiscordAccountCard username={account.discordUsername} />
      </AccountGroup>

      <AccountGroup id="classes" title="Classes & reminders">
        <PushCard />
        <CalendarFeedCard />
      </AccountGroup>

      <AccountGroup id="family" title="Family & offers">
        <ParentModeCard />
        <ScholarshipCard />
        <ReferralCard />
      </AccountGroup>

      <AccountGroup id="privacy" title="Privacy & data">
        <SectionCard title="Studio leaderboard">
          {account.leaderboardLinkedChild ? (
            <p className="text-small text-slate-400"><Hint>Hidden while linked to a parent.</Hint></p>
          ) : (
            <LeaderboardPrivacySwitch initialHidden={account.leaderboardHidden} />
          )}
        </SectionCard>
        <PrivacySection history={history} />
        <SectionCard advanced title="Download my data" value="Everything we keep, as one file">
          <a href="/api/account/export" download className={buttonVariants({ variant: "secondary", size: "sm" })}>
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
    <SectionCard advanced title="Saved Atom conversations" value={history.length === 0 ? "Nothing saved" : `${history.length} ${history.length === 1 ? "message" : "messages"}, kept 30 days`}>
      <div>
        <h3 className="text-small font-medium text-slate-200">History → Atom</h3>
        <div className="mt-3 max-h-96 space-y-2 overflow-y-auto rounded-xl p-3 bg-neu-base shadow-raised-low">
          {history.length === 0 ? (
            <p className="py-6 text-center text-small text-slate-500">
              Nothing here yet.
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
          <Link href="/privacy" className="underline underline-offset-2 text-slate-50 hover:opacity-70">
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
      <h2 className="text-title text-slate-50 font-semibold">Appearance</h2>
      <div className="mt-6 max-w-md">
        <AppearanceTiles />
        <div className="mt-6">
          <SolidSurfacesSwitch />
        </div>
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
          <div data-deck-header className="deck-header -mt-4 pt-4">
            <h1 className="font-hero text-hero font-bold text-balance text-slate-50">Settings</h1>
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

function MembershipSection({ activePlan }: { activePlan: ActivePlanInfo | null }) {
  return (
    <div className="space-y-6">
      <SectionCard title="Membership & purchases">
        <div className="-my-1 divide-y divide-slate-50/8">
          <Link href="/billing/plans" className="tap group flex items-center justify-between gap-3 py-3 text-body font-medium text-slate-100 transition hover:text-slate-50">
            Payment plan
            <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-slate-500 transition group-hover:translate-x-0.5" />
          </Link>
          <Link href="/billing/history" className="tap group flex items-center justify-between gap-3 py-3 text-body font-medium text-slate-100 transition hover:text-slate-50">
            Payment history
            <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-slate-500 transition group-hover:translate-x-0.5" />
          </Link>
        </div>
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


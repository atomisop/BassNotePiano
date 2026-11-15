"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { SlideOverPanel } from "@/components/layout/SlideOverPanel";
import { TermsContent, TERMS_LAST_UPDATED } from "@/components/legal/TermsContent";
import { PrivacyContent, PRIVACY_LAST_UPDATED } from "@/components/legal/PrivacyContent";
import { CHANGELOG, CURRENT_VERSION } from "@/lib/changelog";
import { CheckIcon } from "@/components/ui/icons";
import { WideLayout } from "@/components/layout/PageLayouts";
import { PageBack } from "@/components/ui/BackLink";
import { ChevronRight, Clock, FileText, Info, ShieldCheck, type AppIcon } from "@/components/ui/appIcons";

const TAB_ICONS = {
  about: Info,
  updates: Clock,
  terms: FileText,
  privacy: ShieldCheck,
  chevron: ChevronRight,
} satisfies Record<string, AppIcon>;

const TABS = [
  { id: "about", label: "About", detail: `Version ${CURRENT_VERSION}`, icon: TAB_ICONS.about },
  { id: "updates", label: "Update notes", detail: CHANGELOG[0] ? `Newest: ${CHANGELOG[0].title}` : "What changed", icon: TAB_ICONS.updates },
  { id: "terms", label: "Terms & refunds", detail: `Updated ${TERMS_LAST_UPDATED}`, icon: TAB_ICONS.terms },
  { id: "privacy", label: "Privacy", detail: `Updated ${PRIVACY_LAST_UPDATED}`, icon: TAB_ICONS.privacy },
] as const;

type TabId = (typeof TABS)[number]["id"];

function TabIcon({ icon: Icon, className = "h-[18px] w-[18px] shrink-0" }: { icon: AppIcon; className?: string }) {
  return <Icon className={className} />;
}

function DesktopAboutNav({ activeTab, onSelect }: { activeTab: TabId; onSelect: (tab: TabId) => void }) {
  return (
    <nav className="sticky top-6 hidden w-56 shrink-0 flex-col gap-1 self-start rounded-card bg-neu-base shadow-raised-low p-2 lg:flex">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onSelect(tab.id)}
          aria-current={activeTab === tab.id ? "page" : undefined}
          className={`tap flex items-center gap-2.5 rounded-control px-3 py-2.5 text-left text-small font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
            activeTab === tab.id ? "bg-neu-lift text-slate-50" : "text-slate-400 hover:bg-neu-lift hover:text-slate-100"
          }`}
        >
          <TabIcon icon={tab.icon} />
          {tab.label}
        </button>
      ))}
    </nav>
  );
}

function MobileAboutMenu({ onSelect }: { onSelect: (tab: TabId) => void }) {
  // The same rows as Settings on a phone: a tinted icon, the name, one quiet line saying what is inside.
  return (
    <div className="divide-y divide-slate-50/8 overflow-hidden rounded-card bg-neu-base shadow-raised-low lg:hidden">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onSelect(tab.id)}
          className="tap flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-slate-50/4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        >
          <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control bg-signal/16 text-signal-fg">
            <TabIcon icon={tab.icon} className="h-5 w-5 shrink-0" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-body font-medium text-slate-50">{tab.label}</span>
            <span className="mt-0.5 block truncate text-caption text-slate-500">{tab.detail}</span>
          </span>
          <TabIcon icon={TAB_ICONS.chevron} className="h-4 w-4 shrink-0 text-slate-500" />
        </button>
      ))}
    </div>
  );
}

function AboutTab() {
  return (
    <div className="rounded-card bg-neu-base shadow-raised-low p-5 md:p-6">
      <p className="text-caption font-medium uppercase tracking-caps text-slate-500">Bass Note Piano</p>
      <p className="mt-1 text-title text-slate-50 font-semibold">Version {CURRENT_VERSION}</p>
      <p className="mt-3 max-w-md text-small text-slate-400">
        An interactive masterclass in the Ethiopian scale system: Tizita, Bati, Anchihoye, and Mixolydian
        pentatonics, spelled correctly in every key, with native chords mapped for each one.
      </p>
      <p className="mt-6 text-small text-slate-500">© {new Date().getFullYear()} Bass Note Piano.</p>
    </div>
  );
}

/** Update notes shown before "Show N more" (DESIGN.md, Hierarchy 9: show a few, fold the rest). */
const UPDATES_SHOWN = 3;

function UpdateEntry({ entry }: { entry: (typeof CHANGELOG)[number] }) {
  return (
    <div className="rounded-card bg-neu-base shadow-raised-low p-5 md:p-6">
      <div className="flex items-baseline justify-between gap-4">
        <p className="text-caption font-medium uppercase tracking-caps text-slate-500">v{entry.version}</p>
        <p className="text-caption text-slate-500">{entry.date}</p>
      </div>
      <h2 className="mt-1 text-title text-slate-50 font-semibold">{entry.title}</h2>
      <ul className="mt-3 space-y-1.5">
        {entry.items.map((item) => (
          <li key={item} className="flex gap-2.5 text-small text-slate-300">
            <CheckIcon className="mt-1 shrink-0 text-slate-500" />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function UpdatesTab() {
  const rest = CHANGELOG.slice(UPDATES_SHOWN);
  return (
    <div className="space-y-4">
      {CHANGELOG.slice(0, UPDATES_SHOWN).map((entry) => (
        <UpdateEntry key={entry.version} entry={entry} />
      ))}
      {rest.length > 0 && (
        <details className="group/more">
          <summary className="tap flex cursor-pointer list-none items-center px-1 py-2 text-small font-medium text-slate-400 hover:text-slate-200 group-open/more:hidden [&::-webkit-details-marker]:hidden">
            Show {rest.length} earlier {rest.length === 1 ? "update" : "updates"}
          </summary>
          <div className="space-y-4">
            {rest.map((entry) => (
              <UpdateEntry key={entry.version} entry={entry} />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function TermsTab() {
  return (
    <div className="rounded-card bg-neu-base shadow-raised-low space-y-6 p-5 md:p-6">
      <div>
        <p className="text-caption font-medium uppercase tracking-caps text-slate-500">Legal</p>
        <p className="mt-1 text-title text-slate-50 font-semibold">Terms &amp; refund policy</p>
        <p className="mt-2 text-small text-slate-500">
          Last updated {TERMS_LAST_UPDATED}.
        </p>
      </div>
      <TermsContent />
    </div>
  );
}

function PrivacyTab() {
  return (
    <div className="rounded-card bg-neu-base shadow-raised-low space-y-6 p-5 md:p-6">
      <div>
        <p className="text-caption font-medium uppercase tracking-caps text-slate-500">Legal</p>
        <p className="mt-1 text-title text-slate-50 font-semibold">Privacy policy</p>
        <p className="mt-2 text-small text-slate-500">
          Last updated {PRIVACY_LAST_UPDATED}.
        </p>
      </div>
      <PrivacyContent />
    </div>
  );
}

function TabContent({ tab }: { tab: TabId }) {
  if (tab === "about") return <AboutTab />;
  if (tab === "updates") return <UpdatesTab />;
  if (tab === "terms") return <TermsTab />;
  return <PrivacyTab />;
}

function AboutClientInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const initialTab: TabId = TABS.some((t) => t.id === requestedTab) ? (requestedTab as TabId) : "about";
  const [activeTab, setActiveTab] = useState<TabId>(initialTab);
  const [mobileOpenTab, setMobileOpenTab] = useState<TabId | null>(null);

  useEffect(() => {
    if (!requestedTab || !TABS.some((t) => t.id === requestedTab)) return;
    if (window.matchMedia("(max-width: 1023px)").matches) {
      setMobileOpenTab(requestedTab as TabId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function selectDesktopTab(tab: TabId) {
    setActiveTab(tab);
    router.replace(`/about?tab=${tab}`, { scroll: false });
  }

  function openMobileTab(tab: TabId) {
    setActiveTab(tab);
    setMobileOpenTab(tab);
    router.replace(`/about?tab=${tab}`, { scroll: false });
  }

  return (
    <WideLayout>
      {/* Only ever linked from Settings, see AccountSettings.tsx. */}
      <PageBack href="/account" />
      <div>
        <p className="text-caption font-medium uppercase tracking-caps text-slate-500">Info</p>
        <h1 data-page-title="" className="font-hero text-hero font-bold text-balance mt-1.5 text-slate-50">About</h1>
      </div>

      <div className="mt-6 flex flex-col gap-8 lg:flex-row">
        <DesktopAboutNav activeTab={activeTab} onSelect={selectDesktopTab} />
        <MobileAboutMenu onSelect={openMobileTab} />
        <div className="hidden min-w-0 flex-1 lg:block">
          <TabContent tab={activeTab} />
        </div>
      </div>

      <SlideOverPanel
        open={mobileOpenTab !== null}
        onClose={() => setMobileOpenTab(null)}
        title={mobileOpenTab ? TABS.find((t) => t.id === mobileOpenTab)!.label : ""}
      >
        {mobileOpenTab && <TabContent tab={mobileOpenTab} />}
      </SlideOverPanel>
    </WideLayout>
  );
}

export function AboutClient() {
  return (
    <Suspense fallback={null}>
      <AboutClientInner />
    </Suspense>
  );
}

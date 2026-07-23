"use client";

import { Suspense, useRef, useState, type FormEvent } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import type { LearningGoal, MusicGenre, PrimaryInstrument, SkillLevel } from "@prisma/client";
import { CodeGate } from "./CodeGate";
import {
  requestNameChangeAction,
  confirmNameChangeAction,
  requestPasswordChangeAction,
  confirmPasswordChangeAction,
  requestAvatarChangeAction,
  confirmAvatarChangeAction,
  updateMusicProfileAction,
  updateNotificationPreferencesAction,
  updateUsernameAction,
  type NotificationPreferencesInput,
} from "./actions";

interface MusicProfile {
  primaryInstrument: PrimaryInstrument | null;
  skillLevel: SkillLevel | null;
  genres: MusicGenre[];
  learningGoal: LearningGoal | null;
}

interface AccountSettingsProps {
  email: string;
  initialName: string | null;
  initialImage: string | null;
  initialUsername: string | null;
  initialMusicProfile: MusicProfile;
  isProMember: boolean;
  initialNotificationPreferences: NotificationPreferencesInput;
}

const MAX_AVATAR_BYTES = 1_800_000;

const INSTRUMENTS: { value: PrimaryInstrument; label: string }[] = [
  { value: "PIANO_KEYBOARD", label: "Piano / Keyboard" },
  { value: "BASS", label: "Bass" },
  { value: "GUITAR", label: "Guitar" },
  { value: "DRUMS", label: "Drums" },
  { value: "VOCAL", label: "Vocal" },
  { value: "OTHER", label: "Other" },
];

const SKILL_LEVELS: { value: SkillLevel; label: string }[] = [
  { value: "BEGINNER", label: "Beginner" },
  { value: "INTERMEDIATE", label: "Intermediate" },
  { value: "ADVANCED", label: "Advanced" },
];

const GENRES: { value: MusicGenre; label: string }[] = [
  { value: "JAZZ", label: "Jazz" },
  { value: "CLASSICAL", label: "Classical" },
  { value: "RNB", label: "R&B" },
  { value: "ROCK", label: "Rock" },
  { value: "POP", label: "Pop" },
  { value: "GOSPEL", label: "Gospel" },
];

const LEARNING_GOALS: { value: LearningGoal; label: string }[] = [
  { value: "LEARN_THEORY_SCALES", label: "Learn theory & scales" },
  { value: "MASTER_RHYTHM_CHORDS", label: "Master rhythm & chords" },
  { value: "PREPARE_PERFORMANCE", label: "Prepare for a performance" },
  { value: "HOBBYIST", label: "Just for fun (hobbyist)" },
];

const TAB_ICONS = {
  profile: "M12 12a4 4 0 100-8 4 4 0 000 8zM4 21c0-4.4 3.6-8 8-8s8 3.6 8 8",
  notifications:
    "M12 3a5 5 0 00-5 5v2.7c0 .57-.19 1.13-.53 1.58L5 14.5c-.94 1.24-.06 3 1.49 3h11.02c1.55 0 2.43-1.76 1.49-3l-1.47-2.22a2.67 2.67 0 01-.53-1.58V8a5 5 0 00-5-5zM9.5 19.5a2.5 2.5 0 005 0",
  membership: "M3 8h18M3 6h18v12a1 1 0 01-1 1H4a1 1 0 01-1-1V6zM7 15h4",
  password: "M12 15v2M6 10V7a6 6 0 1112 0v3M5 10h14v10a1 1 0 01-1 1H6a1 1 0 01-1-1V10z",
} as const;

const TABS = [
  { id: "profile", label: "Profile Settings", icon: TAB_ICONS.profile },
  { id: "notifications", label: "Notifications", icon: TAB_ICONS.notifications },
  { id: "membership", label: "Membership & Purchases", icon: TAB_ICONS.membership },
  { id: "password", label: "Password", icon: TAB_ICONS.password },
] as const;

type TabId = (typeof TABS)[number]["id"];

function TabIcon({ path }: { path: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-[18px] w-[18px] shrink-0">
      <path d={path} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Pill({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
        selected
          ? "border-amber-400/60 bg-amber-400/10 text-amber-200"
          : "border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-700"
      }`}
    >
      {label}
    </button>
  );
}

function SectionCard({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
      <h2 className="font-serif text-lg text-slate-50">{title}</h2>
      <p className="mt-1 text-sm text-slate-500">{description}</p>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function SettingsTabs({ activeTab, onSelect }: { activeTab: TabId; onSelect: (tab: TabId) => void }) {
  return (
    <>
      <nav className="mb-2 flex gap-2 overflow-x-auto pb-1 lg:hidden">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onSelect(tab.id)}
            className={`flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
              activeTab === tab.id
                ? "border-amber-400/50 bg-slate-900 text-amber-200"
                : "border-slate-800 text-slate-400 hover:border-slate-700"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </nav>
      <nav className="sticky top-6 hidden w-56 shrink-0 flex-col gap-1 self-start rounded-2xl border border-slate-800 bg-slate-900/60 p-2 lg:flex">
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
    </>
  );
}

function AccountSettingsInner({
  email,
  initialName,
  initialImage,
  initialUsername,
  initialMusicProfile,
  isProMember,
  initialNotificationPreferences,
}: AccountSettingsProps) {
  const { update } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const initialTab: TabId = TABS.some((t) => t.id === requestedTab) ? (requestedTab as TabId) : "profile";
  const [activeTab, setActiveTab] = useState<TabId>(initialTab);

  function selectTab(tab: TabId) {
    setActiveTab(tab);
    router.replace(`/account?tab=${tab}`, { scroll: false });
  }

  async function syncSession() {
    await update();
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-amber-400/80">Settings</p>
        <h1 className="mt-1.5 font-serif text-2xl text-slate-50">Account</h1>
        <p className="mt-1 text-sm text-slate-500">
          Every change here is confirmed with a 6-digit code sent to <span className="text-slate-300">{email}</span>.
        </p>
      </div>

      <div className="mt-6 flex flex-col gap-8 lg:flex-row">
        <SettingsTabs activeTab={activeTab} onSelect={selectTab} />

        <div className="min-w-0 flex-1 space-y-6">
          {activeTab === "profile" && (
            <>
              <AvatarSection initialImage={initialImage} email={email} onDone={syncSession} />
              <NameSection initialName={initialName} email={email} onDone={syncSession} />
              <UsernameSection initialUsername={initialUsername} />
              <MusicProfileSection initial={initialMusicProfile} />
            </>
          )}

          {activeTab === "notifications" && <NotificationSettingsSection initial={initialNotificationPreferences} />}

          {activeTab === "membership" && <MembershipSection isProMember={isProMember} />}

          {activeTab === "password" && <PasswordSection email={email} />}
        </div>
      </div>
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

function MembershipSection({ isProMember }: { isProMember: boolean }) {
  return (
    <SectionCard title="Membership & purchases" description="Your plan, payment history, and upgrade options.">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 p-4">
        <div>
          <p className="text-sm text-slate-100">{isProMember ? "Pro — Lifetime access" : "Pay-As-You-Go"}</p>
          <p className="mt-0.5 text-xs text-slate-500">
            {isProMember ? "All six scale groups are unlocked, for good." : "Unlock scales one at a time, or upgrade anytime."}
          </p>
        </div>
        {!isProMember && (
          <Link
            href="/billing/pro"
            className="rounded-lg bg-amber-400 px-4 py-2 text-xs font-semibold text-slate-950 transition hover:bg-amber-300"
          >
            Upgrade to Pro
          </Link>
        )}
      </div>

      <Link
        href="/billing/history"
        className="mt-3 flex items-center justify-between rounded-xl border border-slate-800 p-4 text-sm text-slate-200 transition hover:border-amber-400/30 hover:text-amber-200"
      >
        Payment history
        <span className="text-slate-500">→</span>
      </Link>
    </SectionCard>
  );
}

function MusicProfileSection({ initial }: { initial: MusicProfile }) {
  const [instrument, setInstrument] = useState(initial.primaryInstrument);
  const [skillLevel, setSkillLevel] = useState(initial.skillLevel);
  const [genres, setGenres] = useState<MusicGenre[]>(initial.genres);
  const [goal, setGoal] = useState(initial.learningGoal);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function toggleGenre(value: MusicGenre) {
    setGenres((prev) => (prev.includes(value) ? prev.filter((g) => g !== value) : [...prev, value]));
  }

  async function handleSave() {
    setError(null);
    setSuccess(false);
    if (!instrument || !skillLevel || !goal) {
      setError("Fill in every field.");
      return;
    }

    setSubmitting(true);
    const result = await updateMusicProfileAction({ primaryInstrument: instrument, skillLevel, genres, learningGoal: goal });
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSuccess(true);
  }

  return (
    <SectionCard title="Music profile" description="Personalizes your dashboard — collected once during onboarding.">
      <div className="space-y-4">
        <div>
          <p className="mb-1.5 text-xs font-medium text-slate-400">Primary instrument</p>
          <div className="flex flex-wrap gap-2">
            {INSTRUMENTS.map((opt) => (
              <Pill key={opt.value} label={opt.label} selected={instrument === opt.value} onClick={() => setInstrument(opt.value)} />
            ))}
          </div>
        </div>
        <div>
          <p className="mb-1.5 text-xs font-medium text-slate-400">Skill level</p>
          <div className="flex flex-wrap gap-2">
            {SKILL_LEVELS.map((opt) => (
              <Pill key={opt.value} label={opt.label} selected={skillLevel === opt.value} onClick={() => setSkillLevel(opt.value)} />
            ))}
          </div>
        </div>
        <div>
          <p className="mb-1.5 text-xs font-medium text-slate-400">Genres</p>
          <div className="flex flex-wrap gap-2">
            {GENRES.map((opt) => (
              <Pill key={opt.value} label={opt.label} selected={genres.includes(opt.value)} onClick={() => toggleGenre(opt.value)} />
            ))}
          </div>
        </div>
        <div>
          <p className="mb-1.5 text-xs font-medium text-slate-400">Learning goal</p>
          <div className="flex flex-wrap gap-2">
            {LEARNING_GOALS.map((opt) => (
              <Pill key={opt.value} label={opt.label} selected={goal === opt.value} onClick={() => setGoal(opt.value)} />
            ))}
          </div>
        </div>
      </div>

      {error && <p className="mt-3 text-xs text-red-400">{error}</p>}
      {success && <p className="mt-3 text-xs text-emerald-400">Music profile updated.</p>}

      <button
        type="button"
        onClick={handleSave}
        disabled={submitting}
        className="mt-4 rounded-lg bg-amber-400 px-4 py-1.5 text-xs font-semibold text-slate-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? "Saving…" : "Save"}
      </button>
    </SectionCard>
  );
}

function AvatarSection({ initialImage, email, onDone }: { initialImage: string | null; email: string; onDone: () => Promise<void> }) {
  const [image, setImage] = useState(initialImage);
  const [pendingDataUri, setPendingDataUri] = useState<string | null>(null);
  const [awaitingCode, setAwaitingCode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [success, setSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: FormEvent<HTMLInputElement>) {
    setError(null);
    setSuccess(false);
    const file = e.currentTarget.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("Choose an image file.");
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      setError("Image must be under 1.8MB.");
      return;
    }

    setUploading(true);
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUri = reader.result as string;
      const result = await requestAvatarChangeAction(dataUri);
      setUploading(false);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setPendingDataUri(dataUri);
      setAwaitingCode(true);
    };
    reader.onerror = () => {
      setUploading(false);
      setError("Couldn't read that file.");
    };
    reader.readAsDataURL(file);
  }

  return (
    <SectionCard title="Profile photo" description="Shown across your dashboard and the admin panel.">
      <div className="flex items-center gap-4">
        <div className="h-16 w-16 overflow-hidden rounded-full border border-slate-800 bg-slate-800">
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={image} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xs text-slate-500">None</div>
          )}
        </div>
        <div>
          <button
            type="button"
            disabled={uploading || awaitingCode}
            onClick={() => fileInputRef.current?.click()}
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:border-slate-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {uploading ? "Preparing…" : "Choose new photo"}
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
        </div>
      </div>

      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
      {success && <p className="mt-2 text-xs text-emerald-400">Profile photo updated.</p>}

      {awaitingCode && pendingDataUri && (
        <CodeGate
          email={email}
          onConfirm={confirmAvatarChangeAction}
          onResend={async () => {
            await requestAvatarChangeAction(pendingDataUri);
          }}
          onCancel={() => {
            setAwaitingCode(false);
            setPendingDataUri(null);
          }}
          onSuccess={async () => {
            setImage(pendingDataUri);
            setAwaitingCode(false);
            setPendingDataUri(null);
            setSuccess(true);
            await onDone();
          }}
        />
      )}
    </SectionCard>
  );
}

function NameSection({ initialName, email, onDone }: { initialName: string | null; email: string; onDone: () => Promise<void> }) {
  const [name, setName] = useState(initialName ?? "");
  const [pendingName, setPendingName] = useState<string | null>(null);
  const [awaitingCode, setAwaitingCode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    setSubmitting(true);
    const result = await requestNameChangeAction(name);
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setPendingName(name.trim());
    setAwaitingCode(true);
  }

  return (
    <SectionCard title="Display name" description="How you're addressed across the platform.">
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={awaitingCode}
          className="flex-1 rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-amber-400/60 disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={submitting || awaitingCode || name.trim() === (initialName ?? "")}
          className="rounded-lg bg-amber-400 px-4 py-2 text-xs font-semibold text-slate-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? "Sending…" : "Save"}
        </button>
      </form>

      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
      {success && <p className="mt-2 text-xs text-emerald-400">Name updated.</p>}

      {awaitingCode && pendingName && (
        <CodeGate
          email={email}
          onConfirm={confirmNameChangeAction}
          onResend={async () => {
            await requestNameChangeAction(pendingName);
          }}
          onCancel={() => {
            setAwaitingCode(false);
            setPendingName(null);
          }}
          onSuccess={async () => {
            setAwaitingCode(false);
            setPendingName(null);
            setSuccess(true);
            await onDone();
          }}
        />
      )}
    </SectionCard>
  );
}

function UsernameSection({ initialUsername }: { initialUsername: string | null }) {
  const [username, setUsernameValue] = useState(initialUsername ?? "");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    setSubmitting(true);
    const result = await updateUsernameAction(username);
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setUsernameValue(result.username ?? username);
    setSuccess(true);
  }

  return (
    <SectionCard title="Username" description="How friends find and add you on the Friends page.">
      <form onSubmit={handleSubmit} className="flex gap-2">
        <div className="flex flex-1 items-center rounded-lg border border-slate-800 bg-slate-950 pl-3 focus-within:border-amber-400/60">
          <span className="text-sm text-slate-500">@</span>
          <input
            type="text"
            required
            value={username}
            onChange={(e) => setUsernameValue(e.target.value)}
            className="w-full bg-transparent px-2 py-2 text-sm text-slate-100 outline-none"
          />
        </div>
        <button
          type="submit"
          disabled={submitting || username.trim() === (initialUsername ?? "")}
          className="rounded-lg bg-amber-400 px-4 py-2 text-xs font-semibold text-slate-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? "Saving…" : "Save"}
        </button>
      </form>
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
      {success && <p className="mt-2 text-xs text-emerald-400">Username updated.</p>}
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

  async function handleSubmit(e: FormEvent) {
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
          className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-amber-400/60 disabled:opacity-60"
        />
        <input
          type="password"
          placeholder="New password"
          autoComplete="new-password"
          required
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          disabled={awaitingCode}
          className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-amber-400/60 disabled:opacity-60"
        />
        <input
          type="password"
          placeholder="Confirm new password"
          autoComplete="new-password"
          required
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          disabled={awaitingCode}
          className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-amber-400/60 disabled:opacity-60"
        />

        {error && <p className="text-xs text-red-400">{error}</p>}
        {success && <p className="text-xs text-emerald-400">Password updated.</p>}

        <button
          type="submit"
          disabled={submitting || awaitingCode}
          className="w-full rounded-lg bg-amber-400 py-2 text-xs font-semibold text-slate-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-60"
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
      className={`relative h-5 w-9 shrink-0 rounded-full transition ${checked ? "bg-amber-400" : "bg-slate-800"}`}
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

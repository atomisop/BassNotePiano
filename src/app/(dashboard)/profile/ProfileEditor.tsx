"use client";

import { useRef, useState, type FormEvent } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import type { LearningGoal, MusicGenre, PrimaryInstrument, SkillLevel } from "@prisma/client";
import { CodeGate } from "../account/CodeGate";
import {
  requestNameChangeAction,
  confirmNameChangeAction,
  requestAvatarChangeAction,
  confirmAvatarChangeAction,
  updateMusicProfileAction,
  updateUsernameAction,
} from "../account/actions";

interface MusicProfile {
  primaryInstrument: PrimaryInstrument | null;
  skillLevel: SkillLevel | null;
  genres: MusicGenre[];
  learningGoal: LearningGoal | null;
}

interface ProfileEditorProps {
  email: string;
  initialName: string | null;
  initialImage: string | null;
  initialUsername: string | null;
  initialMusicProfile: MusicProfile;
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

function Pill({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
        selected
          ? "border-amber-400/60 bg-amber-400/10 text-amber-200"
          : "border-white/10 bg-slate-950 text-slate-400 hover:border-white/20"
      }`}
    >
      {label}
    </button>
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

export function ProfileEditor({ email, initialName, initialImage, initialUsername, initialMusicProfile }: ProfileEditorProps) {
  const { update } = useSession();
  const router = useRouter();

  async function syncSession() {
    await update();
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <AvatarSection initialImage={initialImage} email={email} onDone={syncSession} />
      <NameSection initialName={initialName} email={email} onDone={syncSession} />
      <UsernameSection initialUsername={initialUsername} />
      <MusicProfileSection initial={initialMusicProfile} />
    </div>
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
        className="cta-sheen mt-4 rounded-lg bg-amber-400 px-4 py-1.5 text-xs font-semibold text-slate-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-60"
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
        <div className="h-16 w-16 overflow-hidden rounded-full border border-white/10 bg-slate-800">
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
            className="cta-sheen rounded-lg border border-white/15 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:border-white/30 disabled:cursor-not-allowed disabled:opacity-60"
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
          className="flex-1 rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-amber-400/60 disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={submitting || awaitingCode || name.trim() === (initialName ?? "")}
          className="cta-sheen rounded-lg bg-amber-400 px-4 py-2 text-xs font-semibold text-slate-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-60"
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
        <div className="flex flex-1 items-center rounded-lg border border-white/10 bg-slate-950 pl-3 focus-within:border-amber-400/60">
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
          className="cta-sheen rounded-lg bg-amber-400 px-4 py-2 text-xs font-semibold text-slate-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? "Saving…" : "Save"}
        </button>
      </form>
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
      {success && <p className="mt-2 text-xs text-emerald-400">Username updated.</p>}
    </SectionCard>
  );
}

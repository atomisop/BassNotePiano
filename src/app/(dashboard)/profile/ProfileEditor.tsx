"use client";

import { useRef, useState, type FormEvent } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import type { LearningGoal, MusicGenre, PrimaryInstrument, SkillLevel } from "@prisma/client";
import {
  updateNameAction,
  updateAvatarAction,
  updateMusicProfileAction,
  updateUsernameAction,
  requestAvatarUploadUrlAction,
} from "../account/actions";

interface MusicProfile {
  primaryInstrument: PrimaryInstrument | null;
  skillLevel: SkillLevel | null;
  genres: MusicGenre[];
  learningGoal: LearningGoal | null;
}

interface ProfileEditorProps {
  initialName: string | null;
  initialImage: string | null;
  initialUsername: string | null;
  storageConfigured: boolean;
  initialMusicProfile: MusicProfile;
}

// Accepted straight from the file picker — modern phone-camera photos
// routinely land in the 5-15MB range. What's actually stored is far
// smaller: resizeAvatarImage below re-encodes to a capped JPEG before
// anything is uploaded, so this cap is just a sanity ceiling on the
// source file, not a reflection of what ends up in the bucket.
const MAX_AVATAR_SOURCE_BYTES = 10_000_000;
const AVATAR_MAX_DIMENSION = 512;
const AVATAR_JPEG_QUALITY = 0.85;

/**
 * Downscales to AVATAR_MAX_DIMENSION on the longer edge and re-encodes as
 * JPEG — runs entirely in the browser before the upload ever starts, so a
 * large source photo never has to pass through the app server (which would
 * hit Netlify's serverless body-size ceiling well before 10MB) and never
 * bloats storage with a full-resolution image nobody needs for an avatar.
 */
function resizeAvatarImage(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      let { width, height } = img;
      if (width > height && width > AVATAR_MAX_DIMENSION) {
        height = Math.round((height * AVATAR_MAX_DIMENSION) / width);
        width = AVATAR_MAX_DIMENSION;
      } else if (height > AVATAR_MAX_DIMENSION) {
        width = Math.round((width * AVATAR_MAX_DIMENSION) / height);
        height = AVATAR_MAX_DIMENSION;
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Couldn't process that image."));
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("Couldn't process that image."))),
        "image/jpeg",
        AVATAR_JPEG_QUALITY,
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Couldn't read that image."));
    };
    img.src = objectUrl;
  });
}

/** PUT straight to the presigned R2 URL — the app server never sees the image bytes. */
function uploadToR2(uploadUrl: string, blob: Blob, contentType: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl, true);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (${xhr.status}).`)));
    xhr.onerror = () => reject(new Error("Upload failed — check your connection and try again."));
    xhr.send(blob);
  });
}

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
          : "border-ink/10 bg-slate-950 text-slate-400 hover:border-ink/15"
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

export function ProfileEditor({ initialName, initialImage, initialUsername, storageConfigured, initialMusicProfile }: ProfileEditorProps) {
  const { update } = useSession();
  const router = useRouter();

  async function syncSession() {
    await update();
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <AvatarSection initialImage={initialImage} storageConfigured={storageConfigured} onDone={syncSession} />
      <NameSection initialName={initialName} onDone={syncSession} />
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

function AvatarSection({
  initialImage,
  storageConfigured,
  onDone,
}: {
  initialImage: string | null;
  storageConfigured: boolean;
  onDone: () => Promise<void>;
}) {
  const [image, setImage] = useState(initialImage);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [success, setSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFileChange(e: FormEvent<HTMLInputElement>) {
    setError(null);
    setSuccess(false);
    const file = e.currentTarget.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("Choose an image file.");
      return;
    }
    if (file.size > MAX_AVATAR_SOURCE_BYTES) {
      setError("Image must be under 10MB.");
      return;
    }

    setUploading(true);
    try {
      const resized = await resizeAvatarImage(file);
      const { uploadUrl, publicUrl } = await requestAvatarUploadUrlAction(file.name, "image/jpeg");
      await uploadToR2(uploadUrl, resized, "image/jpeg");
      const result = await updateAvatarAction(publicUrl);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setImage(result.image);
      setSuccess(true);
      await onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <SectionCard title="Profile photo" description="Shown across your dashboard and the admin panel.">
      <div className="flex items-center gap-4">
        <div className="h-16 w-16 overflow-hidden rounded-full border border-ink/10 bg-slate-800">
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
            disabled={uploading || !storageConfigured}
            onClick={() => fileInputRef.current?.click()}
            className="cta-sheen rounded-lg border border-ink/10 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:border-ink/20 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {uploading ? "Uploading…" : "Choose new photo"}
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
        </div>
      </div>

      {!storageConfigured && <p className="mt-2 text-xs text-slate-500">Image upload isn't configured yet.</p>}
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
      {success && <p className="mt-2 text-xs text-emerald-400">Profile photo updated.</p>}
    </SectionCard>
  );
}

function NameSection({ initialName, onDone }: { initialName: string | null; onDone: () => Promise<void> }) {
  const [name, setName] = useState(initialName ?? "");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    setSubmitting(true);
    const result = await updateNameAction(name);
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSuccess(true);
    await onDone();
  }

  return (
    <SectionCard title="Display name" description="How you're addressed across the platform.">
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={submitting}
          className="flex-1 rounded-lg border border-ink/10 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-amber-400/60 disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={submitting || name.trim() === (initialName ?? "")}
          className="cta-sheen rounded-lg bg-amber-400 px-4 py-2 text-xs font-semibold text-slate-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? "Saving…" : "Save"}
        </button>
      </form>

      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
      {success && <p className="mt-2 text-xs text-emerald-400">Name updated.</p>}
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
        <div className="flex flex-1 items-center rounded-lg border border-ink/10 bg-slate-950 pl-3 focus-within:border-amber-400/60">
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

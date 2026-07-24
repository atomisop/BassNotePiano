"use client";

import { useState } from "react";
import type { LearningGoal, MusicGenre, PrimaryInstrument, SkillLevel } from "@prisma/client";
import { SlideOverPanel } from "@/components/layout/SlideOverPanel";
import { NavIcon, ICON_PATHS } from "@/components/layout/navIcons";
import { ProfileEditor } from "./ProfileEditor";

interface MusicProfile {
  primaryInstrument: PrimaryInstrument | null;
  skillLevel: SkillLevel | null;
  genres: MusicGenre[];
  learningGoal: LearningGoal | null;
}

interface ProfileEditButtonProps {
  email: string;
  initialName: string | null;
  initialImage: string | null;
  initialUsername: string | null;
  initialMusicProfile: MusicProfile;
}

// Everything that used to sit permanently on the Profile page — photo,
// name, username, music profile — now lives behind this one button instead.
export function ProfileEditButton(props: ProfileEditButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Edit profile"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 text-slate-400 transition hover:border-white/20 hover:bg-white/5 hover:text-amber-300"
      >
        <NavIcon path={ICON_PATHS.edit} className="h-4 w-4" />
      </button>

      <SlideOverPanel open={open} onClose={() => setOpen(false)} title="Edit profile">
        <ProfileEditor {...props} />
      </SlideOverPanel>
    </>
  );
}

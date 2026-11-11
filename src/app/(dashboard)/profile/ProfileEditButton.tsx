"use client";

import { useState } from "react";
import type { LearningGoal, MusicGenre, PrimaryInstrument, SkillLevel } from "@prisma/client";
import { SlideOverPanel } from "@/components/layout/SlideOverPanel";
import { Pencil } from "@/components/ui/appIcons";
import { ProfileEditor } from "./ProfileEditor";
import { buttonVariants } from "@/components/ui/button";

interface MusicProfile {
  primaryInstrument: PrimaryInstrument | null;
  skillLevel: SkillLevel | null;
  genres: MusicGenre[];
  learningGoal: LearningGoal | null;
}

interface ProfileEditButtonProps {
  initialName: string | null;
  initialImage: string | null;
  initialUsername: string | null;
  storageConfigured: boolean;
  initialMusicProfile: MusicProfile;
}

// Everything that used to sit permanently on the Profile page, photo,
// name, username, music profile, now lives behind this one button instead.
export function ProfileEditButton(props: ProfileEditButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={buttonVariants({ variant: "secondary", size: "sm", className: "shrink-0 gap-1.5" })}>
        <Pencil aria-hidden className="h-4 w-4" />
        Edit profile
      </button>

      <SlideOverPanel open={open} onClose={() => setOpen(false)} title="Edit profile">
        <ProfileEditor {...props} />
      </SlideOverPanel>
    </>
  );
}

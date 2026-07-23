-- CreateEnum
CREATE TYPE "PrimaryInstrument" AS ENUM ('PIANO_KEYBOARD', 'BASS', 'GUITAR', 'DRUMS', 'VOCAL', 'OTHER');

-- CreateEnum
CREATE TYPE "SkillLevel" AS ENUM ('BEGINNER', 'INTERMEDIATE', 'ADVANCED');

-- CreateEnum
CREATE TYPE "MusicGenre" AS ENUM ('JAZZ', 'CLASSICAL', 'RNB', 'ROCK', 'POP', 'GOSPEL');

-- CreateEnum
CREATE TYPE "LearningGoal" AS ENUM ('LEARN_THEORY_SCALES', 'MASTER_RHYTHM_CHORDS', 'PREPARE_PERFORMANCE', 'HOBBYIST');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "genres" "MusicGenre"[] DEFAULT ARRAY[]::"MusicGenre"[],
ADD COLUMN     "learningGoal" "LearningGoal",
ADD COLUMN     "onboardedAt" TIMESTAMP(3),
ADD COLUMN     "primaryInstrument" "PrimaryInstrument",
ADD COLUMN     "skillLevel" "SkillLevel";

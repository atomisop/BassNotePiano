-- Data migration: replace the old 6-item scale curriculum (scale-0..scale-5)
-- with the new 15-standalone-scale curriculum in src/lib/curriculum.ts.
--
-- Only scale-1 has a clean 1:1 mapping to a new scale (Tizita Major /
-- "Major Pentatonic", same formula, same content) — it is renamed in place
-- so every student's ScaleProgress/QuizAttempt/Lesson/ZellePayment rows
-- carry over untouched (they key on ScaleGroup.id, not slug).
--
-- scale-0, scale-2, scale-3, scale-4, scale-5 have no clean 1:1 mapping:
-- scale-0 bundled the major scale and the chromatic scale together,
-- scale-2's content duplicates one of the three variants scale-3 bundled,
-- and scale-3/4/5 each bundled multiple named variants (Bati, Anchihoye,
-- Mixolydian) into one ScaleGroup/one progress row apiece, so a single old
-- completion can't be split across the new standalone scales it used to
-- contain. Per explicit product decision, these 5 rows (and, via
-- ON DELETE CASCADE, every ScaleProgress/QuizAttempt/Lesson row tied to
-- them) are deleted outright rather than migrated — this permanently
-- erases those specific students' progress/quiz history/uploaded lesson
-- content for those 5 old groups.

-- DeleteRows: the 5 bundled/duplicate old scale groups, cascades to
-- ScaleProgress, QuizAttempt, and Lesson rows tied to them.
DELETE FROM "ScaleGroup" WHERE slug IN ('scale-0', 'scale-2', 'scale-3', 'scale-4', 'scale-5');

-- UpdateRow: rename scale-1 in place to the new tizita-major slug/metadata.
-- Same formula, same content — this is a pure rename, not a content change.
UPDATE "ScaleGroup"
SET slug = 'tizita-major',
    "order" = 6,
    code = 'Scale 7',
    title = 'Major Pentatonic',
    "kinitName" = 'Tizita Major',
    formula = '1-2-3-5-6',
    "updatedAt" = CURRENT_TIMESTAMP
WHERE slug = 'scale-1';

-- InsertRows: the 14 scale groups that have no old-row counterpart at all.
INSERT INTO "ScaleGroup" (id, slug, "order", code, title, "kinitName", formula, "updatedAt")
VALUES
  (gen_random_uuid()::text, 'major-scale', 0, 'Scale 1', 'The Major Scale', NULL, '1-2-3-4-5-6-7', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'natural-minor', 1, 'Scale 2', 'The Natural Minor Scale', NULL, '1-2-b3-4-5-b6-b7', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'harmonic-minor', 2, 'Scale 3', 'The Harmonic Minor Scale', NULL, '1-2-b3-4-5-b6-7', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'melodic-minor', 3, 'Scale 4', 'The Melodic Minor Scale', NULL, '1-2-b3-4-5-6-7', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'parallel-minor', 4, 'Scale 5', 'Parallel Minor', NULL, '1-2-b3-4-5-b6-b7', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'chromatic-scale', 5, 'Scale 6', 'The Chromatic Scale', NULL, '1-b2-2-b3-3-4-b5-5-b6-6-b7-7', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'tizita-minor', 7, 'Scale 8', 'Minor Pentatonic (Tizita)', 'Tizita Minor', '1-2-b3-5-b6', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'bati-major', 8, 'Scale 9', 'Bati Major', 'Bati Major', '1-3-4-5-7', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'bati-minor', 9, 'Scale 10', 'Bati Minor', 'Bati Minor', '1-b3-4-5-b7', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'bati-lydian', 10, 'Scale 11', 'Bati Lydian', 'Bati Lydian', '1-3-#4-5-7', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'ambassel-major', 11, 'Scale 12', 'Ambassel Major', 'Ambassel Major', '1-2-4-5-6', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'ambassel-minor', 12, 'Scale 13', 'Ambassel Minor', 'Ambassel Minor', '1-b2-4-5-b6', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'anchihoye', 13, 'Scale 14', 'Anchihoye', 'Anchihoye', '1-b2-4-b5-6', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'anchihoye-dorian', 14, 'Scale 15', 'Anchihoye Dorian', 'Anchihoye Dorian', '1-2-4-5-b7', CURRENT_TIMESTAMP);

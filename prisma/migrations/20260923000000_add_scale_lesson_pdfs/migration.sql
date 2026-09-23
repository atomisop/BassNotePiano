-- Data migration: attach the first real lesson content (PDF worksheets,
-- uploaded to R2 under lessons/<scaleGroupSlug>/) to 6 of the 15 scale
-- groups. major-scale gets its own PDF plus one per mode (its title was
-- renamed to "The Major Scale and the Seven Modes" in the same PR to match
-- — see src/lib/curriculum.ts); natural-minor, harmonic-minor,
-- melodic-minor, parallel-minor, and chromatic-scale each get one.
--
-- uploadedById resolves to whichever User currently holds the ADMIN role
-- rather than a hardcoded id, since this app has exactly one admin and
-- that id differs between this local throwaway database, real local dev,
-- and production — a hardcoded id would silently insert nothing (or the
-- wrong thing) wherever that id doesn't match. Joined in (not a scalar
-- subquery in the SELECT list) specifically so a database with no User
-- rows at all — CI's own fresh postgres:16-alpine service, confirmed live:
-- this migration failed CI with a NOT NULL violation on uploadedById
-- before this fix — makes the whole INSERT a no-op (the join produces zero
-- rows) instead of attempting 13 rows with a NULL uploadedById and
-- crashing the build. Real environments (local dev, production) already
-- have exactly one admin, so behavior there is unchanged.

INSERT INTO "Lesson" (id, "scaleGroupId", "order", title, type, "fileUrl", "fileName", "fileSizeBytes", "uploadedById", "updatedAt")
SELECT gen_random_uuid()::text, sg.id, v."order", v.title, 'PDF'::"LessonMediaType", v."fileUrl", v."fileName", v."fileSizeBytes",
       admin.id,
       CURRENT_TIMESTAMP
FROM (
  VALUES
    ('major-scale', 0, 'The Major Scale', 'https://pub-0fe2f6dde02a45099c1719d7c4e554b5.r2.dev/lessons/major-scale/1790168189098-Major-Scale.pdf', 'Major-Scale.pdf', 15455),
    ('major-scale', 1, 'Mode 1: Ionian', 'https://pub-0fe2f6dde02a45099c1719d7c4e554b5.r2.dev/lessons/major-scale/1790168189812-Mode-1-Ionian.pdf', 'Mode-1-Ionian.pdf', 15168),
    ('major-scale', 2, 'Mode 2: Dorian', 'https://pub-0fe2f6dde02a45099c1719d7c4e554b5.r2.dev/lessons/major-scale/1790168190312-Mode-2-Dorian.pdf', 'Mode-2-Dorian.pdf', 15320),
    ('major-scale', 3, 'Mode 3: Phrygian', 'https://pub-0fe2f6dde02a45099c1719d7c4e554b5.r2.dev/lessons/major-scale/1790168190817-Mode-3-Phrygian.pdf', 'Mode-3-Phrygian.pdf', 15341),
    ('major-scale', 4, 'Mode 4: Lydian', 'https://pub-0fe2f6dde02a45099c1719d7c4e554b5.r2.dev/lessons/major-scale/1790168191265-Mode-4-Lydian.pdf', 'Mode-4-Lydian.pdf', 15251),
    ('major-scale', 5, 'Mode 5: Mixolydian', 'https://pub-0fe2f6dde02a45099c1719d7c4e554b5.r2.dev/lessons/major-scale/1790168191765-Mode-5-Mixolydian.pdf', 'Mode-5-Mixolydian.pdf', 15263),
    ('major-scale', 6, 'Mode 6: Aeolian', 'https://pub-0fe2f6dde02a45099c1719d7c4e554b5.r2.dev/lessons/major-scale/1790168192273-Mode-6-Aeolian.pdf', 'Mode-6-Aeolian.pdf', 15283),
    ('major-scale', 7, 'Mode 7: Locrian', 'https://pub-0fe2f6dde02a45099c1719d7c4e554b5.r2.dev/lessons/major-scale/1790168192702-Mode-7-Locrian.pdf', 'Mode-7-Locrian.pdf', 15381),
    ('natural-minor', 0, 'The Natural Minor Scale', 'https://pub-0fe2f6dde02a45099c1719d7c4e554b5.r2.dev/lessons/natural-minor/1790168193191-Natural-Minor.pdf', 'Natural-Minor.pdf', 15450),
    ('harmonic-minor', 0, 'The Harmonic Minor Scale', 'https://pub-0fe2f6dde02a45099c1719d7c4e554b5.r2.dev/lessons/harmonic-minor/1790168193702-Harmonic-Minor.pdf', 'Harmonic-Minor.pdf', 15946),
    ('melodic-minor', 0, 'The Melodic Minor Scale', 'https://pub-0fe2f6dde02a45099c1719d7c4e554b5.r2.dev/lessons/melodic-minor/1790168194215-Melodic-Minor.pdf', 'Melodic-Minor.pdf', 15700),
    ('parallel-minor', 0, 'Parallel Minor', 'https://pub-0fe2f6dde02a45099c1719d7c4e554b5.r2.dev/lessons/parallel-minor/1790168194726-Parallel-Minor.pdf', 'Parallel-Minor.pdf', 11011),
    ('chromatic-scale', 0, 'The Chromatic Scale', 'https://pub-0fe2f6dde02a45099c1719d7c4e554b5.r2.dev/lessons/chromatic-scale/1790168195339-Chromatic-Scale.pdf', 'Chromatic-Scale.pdf', 11465)
) AS v(slug, "order", title, "fileUrl", "fileName", "fileSizeBytes")
JOIN "ScaleGroup" sg ON sg.slug = v.slug
CROSS JOIN (SELECT id FROM "User" WHERE role = 'ADMIN' ORDER BY "createdAt" ASC LIMIT 1) AS admin;

-- Rename Scale 1's title to reflect its new content (kept in sync with
-- src/lib/curriculum.ts's SCALE_GROUPS in this same PR — the seed script
-- would otherwise overwrite this back on its next run, but the seed
-- script's own SCALE_GROUPS source already carries the new title too).
UPDATE "ScaleGroup" SET title = 'The Major Scale and the Seven Modes', "updatedAt" = CURRENT_TIMESTAMP
WHERE slug = 'major-scale';

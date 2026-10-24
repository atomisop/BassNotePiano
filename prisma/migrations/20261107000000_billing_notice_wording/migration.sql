-- The bell notices the 28-day billing migration sent said "every 4 weeks" and "4-week cycles". The offer is stated in days everywhere else
-- (billed every 28 days, exactly 4 classes a bill), so the notices already sitting in people's bells say the same. Wording only. Matched
-- on the exact title the earlier migration wrote, so nothing else is touched.

UPDATE "Notification"
SET "title" = 'Your plan now bills every 28 days',
    "body" = replace("body", 'Plans are now billed in 4-week cycles, so every cycle holds exactly four of your weekly class.', 'Plans are now billed every 28 days, and each bill pays for exactly 4 classes.')
WHERE "title" = 'Your plan now bills every 4 weeks';

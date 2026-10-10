-- Data change, by the owner's instruction: practice and class reminders are on for everyone who is subscribed.
-- (They were off for everyone by default. A person can still turn them off in Settings; this runs once.)
UPDATE "User"
SET "notifyEmailReminders" = true
WHERE "notifyEmailReminders" = false
  AND "id" IN (SELECT "userId" FROM "PaymentPlan" WHERE "status" = 'ACTIVE');

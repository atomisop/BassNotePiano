-- Billing moves from calendar months to 28-day cycles (four weeks: exactly four of any weekday, never a fifth).
--
-- Data only, no schema change. Plans that have not paid yet need nothing: their first payment starts a 28-day cycle. Plans in the middle
-- of a paid cycle have a due date and credits that run to the end of the old calendar month; both move to the cycle's start plus 28 days.
-- Prices are not touched. Statements are separated by a blank line so a test can run them one at a time. No statement contains a semicolon
-- inside its text.

-- 1. ACTIVE plans with a paid cycle: the live credits expire exactly at nextDueDate (the end of that cycle). Moved first, while the old
--    due date is still there to match on.
UPDATE "CreditGrant" g
SET "expiresAt" = (p."nextDueDate" - INTERVAL '1 month') + INTERVAL '28 days'
FROM "PaymentPlan" p
WHERE g."paymentPlanId" = p."id"
  AND g."source" = 'PAYMENT_PLAN_INSTALLMENT'
  AND g."expiredAt" IS NULL
  AND g."expiresAt" = p."nextDueDate"
  AND p."status" = 'ACTIVE'
  AND p."installmentsPaid" >= 1;

-- 2. The notice goes in before the due date moves, so it can say what the date was. It names the new date, worked out the same way.
INSERT INTO "Notification" ("id", "userId", "type", "title", "body", "createdAt")
SELECT md5(random()::text || clock_timestamp()::text || p."id"),
       p."userId",
       'PAYMENT_PLAN_UPDATED'::"NotificationType",
       'Your plan now bills every 4 weeks',
       'Plans are now billed in 4-week cycles, so every cycle holds exactly four of your weekly class. Your current cycle was adjusted to match: your next payment is due '
         || to_char((((p."nextDueDate" - INTERVAL '1 month') + INTERVAL '28 days') AT TIME ZONE 'UTC') AT TIME ZONE 'America/New_York', 'FMMonth FMDD')
         || '. The price of each payment has not changed.',
       now()
FROM "PaymentPlan" p
WHERE p."status" = 'ACTIVE'
  AND p."installmentsPaid" >= 1;

-- 3. The plans: each one's next due date is its cycle start plus 28 days.
UPDATE "PaymentPlan"
SET "nextDueDate" = ("nextDueDate" - INTERVAL '1 month') + INTERVAL '28 days'
WHERE "status" = 'ACTIVE'
  AND "installmentsPaid" >= 1;

-- 4. COMPLETED plans (a Monthly plan completes on its first payment) that are still inside their paid cycle. The cycle began a month before its latest
--    live credit expires, and nextDueDate points at that start. One statement, so the credits and the plan are moved from the same starting point.
WITH live AS (
  SELECT DISTINCT ON (g."paymentPlanId") g."paymentPlanId" AS plan_id, g."expiresAt" AS old_end
  FROM "CreditGrant" g
  JOIN "PaymentPlan" p ON p."id" = g."paymentPlanId"
  WHERE p."status" = 'COMPLETED'
    AND p."installmentsPaid" >= 1
    AND g."source" = 'PAYMENT_PLAN_INSTALLMENT'
    AND g."expiredAt" IS NULL
    AND g."expiresAt" IS NOT NULL
    AND g."expiresAt" > now()
  ORDER BY g."paymentPlanId", g."expiresAt" DESC
),
notice AS (
  INSERT INTO "Notification" ("id", "userId", "type", "title", "body", "createdAt")
  SELECT md5(random()::text || clock_timestamp()::text || p."id"),
         p."userId",
         'PAYMENT_PLAN_UPDATED'::"NotificationType",
         'Your plan now bills every 4 weeks',
         'Plans are now billed in 4-week cycles, so every cycle holds exactly four of your weekly class. Your paid period now ends on '
           || to_char(((((l.old_end - INTERVAL '1 month') + INTERVAL '28 days')) AT TIME ZONE 'UTC') AT TIME ZONE 'America/New_York', 'FMMonth FMDD')
           || '. The price of each payment has not changed.',
         now()
  FROM live l
  JOIN "PaymentPlan" p ON p."id" = l.plan_id
  RETURNING 1
),
moved_plans AS (
  UPDATE "PaymentPlan" p
  SET "nextDueDate" = l.old_end - INTERVAL '1 month'
  FROM live l
  WHERE p."id" = l.plan_id
  RETURNING p."id"
)
UPDATE "CreditGrant" g
SET "expiresAt" = (l.old_end - INTERVAL '1 month') + INTERVAL '28 days'
FROM live l
WHERE g."paymentPlanId" = l.plan_id
  AND g."source" = 'PAYMENT_PLAN_INSTALLMENT'
  AND g."expiredAt" IS NULL
  AND g."expiresAt" = l.old_end;

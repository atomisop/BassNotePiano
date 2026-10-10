-- Data fix: a plan canceled by an admin used to leave its unpaid bill "awaiting transfer". Close those bills.
UPDATE "ZellePayment"
SET "status" = 'EXPIRED'
WHERE "status" = 'AWAITING_TRANSFER'
  AND "paymentPlanId" IN (SELECT "id" FROM "PaymentPlan" WHERE "status" = 'CANCELED');

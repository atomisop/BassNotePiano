# Family plans (added 2026-10-14)

A family plan is 2 to 4 existing accounts (the payer plus 1 to 3 others), set up under "Me and my family" on `/billing/plans`.

## Rules
- **One plan per person**, each at the family rate (the term's price with `FAMILY_BUNDLE_DISCOUNT_RATE` off), all on the same weekly time.
  Members can still cancel their own plan; a member cannot change the term or the weekly time alone (the teacher does that).
- **All or nobody.** `createFamilyPlans` (`src/lib/paymentPlans.ts`) creates the group, every plan and the first payment in one
  Serializable transaction. If any member cannot start (already on a plan, banned, not a student, no first and last name, the same
  person twice, the time taken), nothing is created.
- **One payer.** The payer is a member. The first month is ONE combined `FAMILY_PLAN_START` payment (everyone's first month added up).
  Approving it starts every member's plan and credits their first month in the same transaction (`approveZellePayment` in
  `payments.ts`); if any plan is no longer waiting to start, the approval fails and a person refunds it. From month two each member
  has a separate monthly bill. The payer may submit a member's bill.
- **Only the payer's bank account settles family money** (`familyPayerOf` in `paymentEmail.ts`): for the combined payment and for every
  member's monthly bill, an email from any other name is left for a person even with the right code, and the softer rules (typo'd code,
  amount alone) never apply to family bills.
- **A family that never starts ends together.** `lapsePlanForNonPayment` on any unstarted member cancels every member's plan and closes
  the combined payment (still held while it is being confirmed).
- **Refund** of the combined payment (`refundZellePayment`) takes back each member's first-month credits and cancels every plan, per the
  admin's two checkboxes.
- Revenue counts the combined payment once; members' first months have no payment rows of their own.

## Not stopped by the system
One person can still make two accounts with two different names and start a family plan for the discount. The system makes that
inconvenient (distinct names, one shared weekly time, one bank account paying) but cannot prove two accounts are two people.
The admin Payment Plans list shows "Family plan of N, paid by X" so a pattern can be spotted.

The old one-payment family bundle (`FAMILY_BUNDLE`, `/billing/lessons`) is retired for new purchases: the page redirects to
`/billing/plans`. Its code and past payments remain.

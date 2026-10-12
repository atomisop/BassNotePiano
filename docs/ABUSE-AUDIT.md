# Ways a customer could cheat the studio (audit of 2026-10-12)

What was checked, what was closed, and what is left on purpose. Tests: `tests/db/abuseGuards.test.ts`, `tests/canonicalEmail.test.ts`.

## Closed

| Gap | How it was used | Fix |
|---|---|---|
| Repeat free trial by deleting the account | Delete the account, register the same inbox again: a second 3-day trial. | The trial is remembered per inbox for good (`trial-used:<inbox>` marker, claimed atomically in `startTrialForEmail`), so deletion and two sign-ups racing cannot give a second one. |
| Repeat free trial with plus tags | `name+2@outlook.com` counted as a new person (only Gmail was folded). | `canonicalEmail` drops the plus tag at every domain (dots still only for Gmail). |
| Squatting on a weekly time | Start a plan and never pay: it held the weekly slot for up to 7 days, then start another. | A plan whose first bill is unpaid after `payments.firstBillLapseDays` (default 2, Settings > Payments) is canceled and the time is free; a payment waiting for review stops it. Runs in the daily installments job. |
| Guessable lesson file addresses | Lesson video and PDF files sit at public R2 addresses built from the lesson name and upload time. | New uploads get a 32 character random token in the address. Existing files keep their old address (see below). |

## Checked and already safe

- Prices and credit amounts are computed on the server; a booking must be exactly one class; bookings are serializable and hold credits.
- A payment can be submitted only by its owner; approving twice is guarded; the bank email can only be used once (Message-ID, DKIM, exact amount, code or name).
- Auto-approval of returning students is capped at one unchecked month and stops after any rejection.
- The public class form has a human check, a honeypot and per-address and per-network limits; sign-up has the same plus a disposable-address block and a phone number that can belong to one account.
- Every account, admin and money endpoint checks the session or a secret; only harmless public ones (page counts, a calendar file) have none.
- Avatar uploads are type and size checked and tied to the user's own folder.

## Left on purpose (business decisions, not bugs)

1. **Term discounts are not a commitment.** A 3 or 6 month plan is priced lower per month, but a student can pay one month and cancel. Options: no self-cancel on a term plan until it ends, or charge back the discount. Needs your decision.
2. **Family bundles for one person.** Two accounts owned by one person can buy a bundle for the extra discount. It cannot be verified without knowing who is who; the discount is small.
3. **Existing lesson files are still public addresses.** Anyone who has the exact address can open it. Closing this fully means signed, expiring links or in-app viewing (the watermarked PDF plan already noted in CLAUDE.md).
4. **Venmo can be reversed by the payer afterwards.** The app cannot see a reversal; check the Unchecked list and your Venmo balance.
5. **Booked but never marked classes are free.** A class only costs credits when attendance is marked; if it is never marked, nothing is charged.

# Payment emails: forwarded to a private address (event-driven)

Bank, Zelle and Venmo "you received money" emails are handled **the moment they arrive**, with nothing polling:

```
bank / SoFi / Venmo -> isaacberhanu777@gmail.com
  -> Gmail filter "forward to" pay-<PAYMENT_INBOX_TOKEN>@inbox.bassnotepiano.com
  -> Mailgun route -> POST https://bassnotepiano.com/api/inbound/payments
  -> ingestPaymentEmail (the same matching rules as ever)
```

The Gmail Apps Script (`scripts/gmail-payment-forwarder.gs`) stays as a slow safety net (every 15 minutes). Both paths use the
email's own Message-ID, so one email is only ever counted once.

## What protects it

1. The address is private: `pay-` plus `PAYMENT_INBOX_TOKEN` (24 random hex characters, in Netlify). It is shown only in the Gmail filter and the Mailgun route.
2. Mailgun's request signature (`MAILGUN_SIGNING_KEY`), as for the support inbox.
3. The sender must be a known bank domain (`ALLOWED_SENDER_DOMAINS` in `src/lib/paymentEmail.ts`).
4. The bank's own DKIM signature on the email must have passed Mailgun's check AND belong to the sender's domain
   (`checkForwardedBankMail`). Gmail's forwarding leaves the message unchanged, so the signature survives. An email that fails
   this is not used and the owner gets the alert "A forwarded payment email was ignored".

## One-time setup (the owner, outside the repo)

1. **Mailgun** > Receiving > Routes > Create route. Expression type "Match Recipient":
   `pay-<PAYMENT_INBOX_TOKEN>@inbox.bassnotepiano.com`. Action: Forward to `https://bassnotepiano.com/api/inbound/payments`. Save.
2. **Gmail** > Settings > Forwarding and POP/IMAP > Add a forwarding address: the same `pay-...@inbox.bassnotepiano.com`.
   Gmail sends a confirmation code to it. It appears in **Admin > Support Chat > Email tab** (the payments route hands it over). Enter it in Gmail.
3. **Gmail filter** (search options): from `ealerts.bankofamerica.com OR venmo.com OR sofi.org OR sofi.com` (SoFi's Zelle notices come from `no-reply@o.sofi.org`) > Create filter > Forward it to the pay- address.
   Add `"sent to you by"` for SoFi if you want only Zelle deposits.
4. Make sure SoFi and the bank email **this** Gmail address (isaacberhanu777@gmail.com) in their notification settings.
5. Change the Apps Script trigger to every 15 minutes.

## If it stops working

Walk the chain in order: the filter (Gmail), the route (Mailgun > Logs), the token (Netlify `PAYMENT_INBOX_TOKEN` must match the
address in the route), then Netlify function logs for `inbound/payments`. The job watchdog's "payment emails have gone quiet"
warning still applies.

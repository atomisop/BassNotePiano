// Google Apps Script. Runs inside the owner's Gmail (isaacberhanu777@gmail.com),
// sends Zelle and Venmo "you received money" emails to the site so matching
// payments are approved automatically. See src/lib/paymentEmail.ts.
//
// Setup: script.google.com > New project > paste this > set SECRET below to
// the same value as PAYMENT_EMAIL_SECRET in Netlify > Triggers (clock icon)
// > Add trigger > forwardPaymentEmails, Time-driven, every 5 minutes.

const SECRET = 'PASTE_THE_SECRET_HERE';
const URL = 'https://bassnotepiano.com/api/payments/email-ingest';
const DONE_LABEL = 'bnp-payment-sent';

function forwardPaymentEmails() {
  const label = GmailApp.getUserLabelByName(DONE_LABEL) || GmailApp.createLabel(DONE_LABEL);
  const query =
    '(from:ealerts.bankofamerica.com OR from:venmo.com OR from:sofi.com) ' +
    '(subject:"sent you" OR subject:"paid you" OR subject:"received") newer_than:3d -label:' + DONE_LABEL;

  GmailApp.search(query, 0, 30).forEach(function (thread) {
    let allSent = true;
    thread.getMessages().forEach(function (message) {
      // Gmail records whether the sender really owns the domain. A forged
      // "from" fails this, so it is never sent to the site.
      const header = message.getRawContent().split('\r\n\r\n')[0];
      if (!/Authentication-Results:[^]*?dmarc=pass/i.test(header)) return;
      const response = UrlFetchApp.fetch(URL, {
        method: 'post',
        contentType: 'application/json',
        headers: { 'x-ingest-secret': SECRET },
        payload: JSON.stringify({
          messageId: message.getId(),
          from: message.getFrom(),
          subject: message.getSubject(),
          body: message.getPlainBody().slice(0, 6000),
        }),
        muteHttpExceptions: true,
      });
      if (response.getResponseCode() !== 200) allSent = false;
    });
    // Only mark the thread done when every message went through, so a failure retries next run.
    if (allSent) thread.addLabel(label);
  });
}

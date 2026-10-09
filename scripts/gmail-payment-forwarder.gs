// Google Apps Script. Runs inside the owner's Gmail (isaacberhanu777@gmail.com),
// sends Zelle and Venmo "you received money" emails to the site so matching
// payments are approved automatically. See src/lib/paymentEmail.ts.
//
// Setup: script.google.com > New project > paste this > set SECRET below to
// the same value as PAYMENT_EMAIL_SECRET in Netlify > Triggers (clock icon)
// > Add trigger > forwardPaymentEmails, Time-driven, every 5 minutes (every
// minute also works, it only uses more of Google's daily limits).
//
// After pasting a new version: choose forwardPaymentEmails and press Run once,
// then approve the permission screen. The script now sends you an email when
// something is wrong, and that needs one new permission.

const SECRET = 'PASTE_THE_SECRET_HERE';
const URL = 'https://bassnotepiano.com/api/payments/email-ingest';
const DONE_LABEL = 'bnp-payment-sent';

// Mail is looked at for this long. The site remembers every email it has seen,
// so reading a long window is safe and a few days of trouble loses nothing.
const LOOKBACK = 'newer_than:14d';
// Runs that fail this many times in a row (5 minutes each is 25 minutes) send an alert.
const ALERT_AFTER_FAILED_RUNS = 5;
// At most one failure alert in this many hours.
const ALERT_COOLDOWN_HOURS = 12;

function forwardPaymentEmails() {
  const problems = [];
  try {
    const label = GmailApp.getUserLabelByName(DONE_LABEL) || GmailApp.createLabel(DONE_LABEL);
    // Bank of America and Venmo are found by their subject. SoFi's subject wording is not relied on: its Zelle
    // emails are found by the sentence in the body ("... sent to you by NAME ..."), and the site ignores any
    // SoFi email that is not a payment, so a wider net costs nothing.
    const query =
      '((from:ealerts.bankofamerica.com OR from:venmo.com) (subject:"sent you" OR subject:"paid you" OR subject:"received") ' +
      'OR (from:sofi.com "sent to you by")) ' + LOOKBACK + ' -label:' + DONE_LABEL;

    GmailApp.search(query, 0, 50).forEach(function (thread) {
      let allSent = true;
      thread.getMessages().forEach(function (message) {
        // Gmail records whether the sender really owns the domain. A forged
        // "from" fails this, so it is never sent to the site. A real bank email
        // failing it is rare, and worth knowing about, so it is reported.
        const header = message.getRawContent().split('\r\n\r\n')[0];
        if (!/Authentication-Results:[^]*?dmarc=pass/i.test(header)) {
          notifyOwner(
            'A payment email was ignored',
            'An email that looks like a payment failed its sender check, so it was NOT sent to the site and no payment was approved from it.\n\n' +
              'From: ' + message.getFrom() + '\nSubject: ' + message.getSubject() +
              '\n\nIf this was a real payment, approve it by hand in Admin > Payments.',
          );
          return;
        }
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
        if (response.getResponseCode() !== 200) {
          allSent = false;
          problems.push('The site answered ' + response.getResponseCode() + ' for "' + message.getSubject() + '".');
        }
      });
      // Only mark the thread done when every message went through, so a failure retries next run.
      if (allSent) thread.addLabel(label);
    });
  } catch (err) {
    problems.push('The script stopped with an error: ' + err);
  }
  recordRun(problems);
}

// Counts failed runs in a row. After a few, emails the owner once (then at most
// every ALERT_COOLDOWN_HOURS), and says so again when it is working again.
function recordRun(problems) {
  const props = PropertiesService.getScriptProperties();
  if (problems.length === 0) {
    props.setProperty('failStreak', '0');
    if (props.getProperty('alerted') === 'yes') {
      props.setProperty('alerted', 'no');
      notifyOwner('Payment emails are working again', 'The Gmail script that reads bank and Venmo emails ran without problems again.');
    }
    return;
  }
  const streak = Number(props.getProperty('failStreak') || '0') + 1;
  props.setProperty('failStreak', String(streak));
  console.error(problems.join(' | '));
  if (streak < ALERT_AFTER_FAILED_RUNS) return;
  const lastAlert = Number(props.getProperty('lastAlertAt') || '0');
  if (Date.now() - lastAlert < ALERT_COOLDOWN_HOURS * 3600 * 1000) return;
  props.setProperty('lastAlertAt', String(Date.now()));
  props.setProperty('alerted', 'yes');
  notifyOwner(
    'Payment emails are failing',
    'The Gmail script that reads bank and Venmo emails has failed ' + streak + ' times in a row, so payments may not be approved automatically.\n\n' +
      problems.slice(0, 5).join('\n') +
      '\n\nNothing is lost: it keeps retrying, and you can approve payments by hand in Admin > Payments. Open script.google.com > Executions to see the details.',
  );
}

function notifyOwner(subject, body) {
  try {
    MailApp.sendEmail(Session.getEffectiveUser().getEmail(), '[Bass Note Piano] ' + subject, body);
  } catch (err) {
    // Sending the alert must never stop the payment script itself.
    console.error('Could not send the alert email: ' + err);
  }
}

// Text messages. One small adapter so the provider can change without touching the code flows.
//
// Sending real texts needs a provider account and costs money per message; there is no free production
// SMS service. Twilio is the first adapter. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and either
// TWILIO_FROM_NUMBER or TWILIO_MESSAGING_SERVICE_SID. Without them, texts are only printed to the server
// log outside production (the same dev mode the email sender has), and in production nothing can be sent.

export class SmsError extends Error {}

function twilioConfig() {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;
  const service = process.env.TWILIO_MESSAGING_SERVICE_SID;
  if (!sid || !token || (!from && !service)) return null;
  return { sid, token, from, service };
}

/** Whether a real provider is set up. */
export function isSmsConfigured(): boolean {
  return twilioConfig() !== null;
}

/**
 * Whether the app can deliver a verification text right now: a provider is set up, or it is not production
 * (where the code is printed to the log). In production without a provider this is false, and the phone
 * step is skipped rather than locking everyone out.
 */
export function smsAvailable(): boolean {
  return isSmsConfigured() || process.env.NODE_ENV !== "production";
}

export async function sendSms(to: string, body: string): Promise<void> {
  const config = twilioConfig();
  if (!config) {
    if (process.env.NODE_ENV === "production") throw new SmsError("Text messages are not set up.");
    console.log(`\n[dev] SMS to ${to}: ${body}\n`);
    return;
  }
  const form = new URLSearchParams({ To: to, Body: body });
  if (config.service) form.set("MessagingServiceSid", config.service);
  else form.set("From", config.from as string);

  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${config.sid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${config.sid}:${config.token}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form,
  });
  if (!res.ok) {
    // Never log the body: it is the code.
    const detail = (await res.json().catch(() => ({}))) as { code?: number; message?: string };
    throw new SmsError(`Text message failed (${res.status}${detail.code ? `, Twilio ${detail.code}` : ""}).`);
  }
}

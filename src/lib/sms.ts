// Phone verification texts. One small adapter so the provider can change without touching the code flows.
//
// Real texts need a provider account and cost money per verification; there is no free production service.
// The provider is Plivo Verify, which makes the 6-digit code, texts it, and checks what the person types, so
// the app never sees the code. Set PLIVO_AUTH_ID and PLIVO_AUTH_TOKEN (and PLIVO_VERIFY_APP_UUID if you do
// not want the account's default Verify application). Without them the app falls back to making its own code
// and, outside production, printing it to the server log (the same dev mode the email sender has). In
// production without them nothing can be sent, so the phone step is switched off instead of locking anyone out.

export class SmsError extends Error {}

const API = "https://api.plivo.com/v1/Account";

function plivoConfig() {
  const authId = process.env.PLIVO_AUTH_ID;
  const authToken = process.env.PLIVO_AUTH_TOKEN;
  if (!authId || !authToken) return null;
  return { authId, authToken, appUuid: process.env.PLIVO_VERIFY_APP_UUID || undefined };
}

/** Whether a real provider is set up. */
export function isSmsConfigured(): boolean {
  return plivoConfig() !== null;
}

/**
 * Whether the app can deliver a verification right now: a provider is set up, or it is not production
 * (where the code is printed to the log). In production without a provider this is false.
 */
export function smsAvailable(): boolean {
  return isSmsConfigured() || process.env.NODE_ENV !== "production";
}

function authHeader(config: { authId: string; authToken: string }): string {
  return `Basic ${Buffer.from(`${config.authId}:${config.authToken}`).toString("base64")}`;
}

/** Asks Plivo to text a fresh code to this number (E.164, such as +15551234567). Returns the session to check it against. */
export async function startVerifySession(to: string): Promise<string> {
  const config = plivoConfig();
  if (!config) throw new SmsError("Text messages are not set up.");
  const res = await fetch(`${API}/${config.authId}/Verify/Session/`, {
    method: "POST",
    headers: { Authorization: authHeader(config), "Content-Type": "application/json" },
    body: JSON.stringify({ recipient: to, channel: "sms", brand_name: "Bass Note Piano", ...(config.appUuid ? { app_uuid: config.appUuid } : {}) }),
  });
  const body = (await res.json().catch(() => ({}))) as { session_uuid?: string; message?: string };
  // Never log the number or the body of a failure beyond the status.
  if (!res.ok || !body.session_uuid) throw new SmsError(`Verification text failed (${res.status}).`);
  return body.session_uuid;
}

export type VerifyOutcome = "valid" | "invalid" | "error";

/**
 * Asks Plivo whether this is the right code for the session. "invalid" covers a wrong code and a session that
 * has expired or been used up; "error" means Plivo could not be asked (network, outage), which is not the
 * person's mistake and must not count against them.
 */
export async function checkVerifySession(session: string, code: string): Promise<VerifyOutcome> {
  const config = plivoConfig();
  if (!config) return "error";
  try {
    const res = await fetch(`${API}/${config.authId}/Verify/Session/${encodeURIComponent(session)}/`, {
      method: "POST",
      headers: { Authorization: authHeader(config), "Content-Type": "application/json" },
      body: JSON.stringify({ otp: code }),
    });
    if (res.ok) return "valid";
    if (res.status === 400 || res.status === 404 || res.status === 403) return "invalid";
    return "error";
  } catch {
    return "error";
  }
}

/** Development only: prints a text instead of sending it. Nothing is sent in production. */
export async function sendSms(to: string, body: string): Promise<void> {
  if (process.env.NODE_ENV === "production") throw new SmsError("Text messages are not set up.");
  console.log(`\n[dev] SMS to ${to}: ${body}\n`);
}

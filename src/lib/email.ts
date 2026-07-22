import { Resend } from "resend";
import type { VerificationPurpose } from "@prisma/client";

const EMAIL_FROM = process.env.EMAIL_FROM ?? "Bass Note Piano <noreply@bassnotepiano.com>";

// Lazily constructed — a missing key shouldn't crash module load (import
// happens on every server boot, including local dev where no key is set).
function getResendClient(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  return new Resend(apiKey);
}

interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  /** Plain-text fallback shown in dev-mode console logging and passed to Resend. */
  text: string;
}

/**
 * The single send path for every transactional email in the app. Without
 * RESEND_API_KEY (local dev, or before it's configured in production) this
 * logs the email to the server console instead of sending — the whole
 * verification/2FA/reset flow is fully testable without real credentials.
 */
async function sendEmail({ to, subject, html, text }: SendEmailParams): Promise<void> {
  const client = getResendClient();

  if (!client) {
    console.log(
      [
        "",
        "=".repeat(60),
        "📧  EMAIL (dev mode — RESEND_API_KEY not set, not actually sent)",
        `To:      ${to}`,
        `Subject: ${subject}`,
        "-".repeat(60),
        text,
        "=".repeat(60),
        "",
      ].join("\n"),
    );
    return;
  }

  const result = await client.emails.send({ from: EMAIL_FROM, to, subject, html, text });
  if (result.error) {
    throw new Error(`Resend failed to send to ${to}: ${result.error.message}`);
  }
}

function emailShell(title: string, bodyHtml: string): string {
  return `
    <div style="background:#f4f4f2;padding:32px 16px;font-family:Georgia,'Times New Roman',serif;">
      <table role="presentation" width="100%" style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e5e1d8;">
        <tr>
          <td style="height:4px;background:linear-gradient(90deg,#c79a3a,#e8d9a8,#c79a3a);"></td>
        </tr>
        <tr>
          <td style="padding:32px 32px 8px;">
            <p style="margin:0 0 4px;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#c79a3a;font-family:Helvetica,Arial,sans-serif;">
              Bass Note Piano
            </p>
            <h1 style="margin:0 0 16px;font-size:22px;color:#1a1a1a;">${title}</h1>
            <div style="font-size:15px;line-height:1.6;color:#333333;font-family:Helvetica,Arial,sans-serif;">
              ${bodyHtml}
            </div>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 32px 28px;border-top:1px solid #efece4;">
            <p style="margin:0;font-size:12px;color:#999999;font-family:Helvetica,Arial,sans-serif;">
              If you didn't request this, you can safely ignore this email.
            </p>
          </td>
        </tr>
      </table>
    </div>
  `;
}

function codeBlockHtml(code: string): string {
  return `
    <div style="margin:20px 0;text-align:center;">
      <span style="display:inline-block;padding:14px 28px;border-radius:12px;background:#faf6ea;border:1px solid #e8d9a8;font-family:'Courier New',monospace;font-size:28px;letter-spacing:8px;font-weight:bold;color:#8a6d1f;">
        ${code}
      </span>
    </div>
  `;
}

const PURPOSE_COPY: Record<VerificationPurpose, { subject: string; heading: string; intro: string }> = {
  EMAIL_VERIFY: {
    subject: "Verify your email — Bass Note Piano",
    heading: "Confirm your email",
    intro: "Welcome to Bass Note Piano. Enter this code to verify your email and finish creating your account.",
  },
  LOGIN_2FA: {
    subject: "Your login code — Bass Note Piano",
    heading: "Confirm it's you",
    intro: "Enter this code to finish logging in.",
  },
  PASSWORD_RESET: {
    subject: "Reset your password — Bass Note Piano",
    heading: "Reset your password",
    intro: "Enter this code to choose a new password.",
  },
  CHANGE_PASSWORD: {
    subject: "Confirm your password change — Bass Note Piano",
    heading: "Confirm password change",
    intro: "Enter this code to confirm you'd like to change your account password.",
  },
  CHANGE_NAME: {
    subject: "Confirm your name change — Bass Note Piano",
    heading: "Confirm name change",
    intro: "Enter this code to confirm your new display name.",
  },
  CHANGE_AVATAR: {
    subject: "Confirm your profile photo change — Bass Note Piano",
    heading: "Confirm photo change",
    intro: "Enter this code to confirm your new profile photo.",
  },
};

export async function sendVerificationCodeEmail(to: string, purpose: VerificationPurpose, code: string) {
  const copy = PURPOSE_COPY[purpose];
  const html = emailShell(
    copy.heading,
    `<p style="margin:0 0 4px;">${copy.intro}</p>${codeBlockHtml(code)}<p style="margin:0;color:#777;font-size:13px;">This code expires in 10 minutes.</p>`,
  );
  const text = `${copy.intro}\n\nYour code: ${code}\n\nThis code expires in 10 minutes.`;
  await sendEmail({ to, subject: copy.subject, html, text });
}

export interface NewLocationAlertDetails {
  city: string | null;
  region: string | null;
  country: string | null;
  ip: string | null;
  when: Date;
}

export async function sendNewLocationLoginAlert(to: string, details: NewLocationAlertDetails) {
  const location = [details.city, details.region, details.country].filter(Boolean).join(", ") || "an unknown location";
  const when = details.when.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });

  const html = emailShell(
    "New login to your account",
    `<p style="margin:0 0 12px;">We noticed a login to your Bass Note Piano account from a location we haven't seen before:</p>
     <p style="margin:0 0 4px;"><strong>Location:</strong> ${location}</p>
     ${details.ip ? `<p style="margin:0 0 4px;"><strong>IP address:</strong> ${details.ip}</p>` : ""}
     <p style="margin:0 0 16px;"><strong>Time:</strong> ${when}</p>
     <p style="margin:0;color:#777;font-size:13px;">If this was you, no action is needed. If it wasn't, reset your password right away.</p>`,
  );
  const text = `New login to your Bass Note Piano account.\n\nLocation: ${location}\n${details.ip ? `IP: ${details.ip}\n` : ""}Time: ${when}\n\nIf this wasn't you, reset your password right away.`;

  await sendEmail({ to, subject: "New login location detected — Bass Note Piano", html, text });
}

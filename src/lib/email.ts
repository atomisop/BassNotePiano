import { Resend } from "resend";
import type { VerificationPurpose } from "@prisma/client";

const EMAIL_FROM = process.env.EMAIL_FROM ?? "Bass Note Piano <noreply@bassnotepiano.com>";
// Real inbox (Squarespace-forwarded), not the noreply sender above. Set so
// hitting "reply" on any app email actually reaches someone, and the
// footer has a real contact address rather than just a link back into the
// app. Not a substitute for the physical mailing address CAN-SPAM
// requires (that's still pending); this just closes the "there's no way to
// write back" gap in the meantime.
const EMAIL_REPLY_TO = process.env.EMAIL_REPLY_TO ?? "music@bassnotepiano.com";

/** Builds an absolute in-app URL for an email link — NEXTAUTH_URL has no trailing slash (matches every other usage of it in this codebase). */
export function getAppUrl(path: string): string {
  return `${process.env.NEXTAUTH_URL}${path}`;
}

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

  const result = await client.emails.send({ from: EMAIL_FROM, to, subject, html, text, replyTo: EMAIL_REPLY_TO });
  if (result.error) {
    throw new Error(`Resend failed to send to ${to}: ${result.error.message}`);
  }
}

// Accent per email "kind" — the app's own real dark ink ground + its
// pink→orange accent (src/app/themes.css: [data-mode="dark"], the app's
// one accent — originally signal green, changed by direct instruction),
// not an invented email-only palette. A cancellation/rejection stays a
// warm red instead of the house accent — orange/pink reads as "this went
// well" everywhere else in the app, and reusing it for a rejection would
// send the wrong signal (same --c-rd-300/400 red the app itself uses for
// errors).
const SHELL_ACCENT = {
  default: { bar: "linear-gradient(90deg,#ff1ab6,#ff8000,#ff1ab6)", dot: "#ff8000" },
  notice: { bar: "linear-gradient(90deg,#ef4444,#fca5a5,#ef4444)", dot: "#ef4444" },
} as const;

interface EmailShellOptions {
  kind?: keyof typeof SHELL_ACCENT;
  /** Overrides the default "manage preferences" footer line — used by code emails, which have a different (ignore-if-not-you) concern. */
  footerNote?: string;
}

function emailShell(title: string, bodyHtml: string, options: EmailShellOptions = {}): string {
  const accent = SHELL_ACCENT[options.kind ?? "default"];
  const footerNote =
    options.footerNote ??
    `You're getting this because you have a Bass Note Piano account. <a href="${getAppUrl("/account?tab=notifications")}" style="color:#ff8000;text-decoration:underline;">Manage email preferences</a>.`;

  return `
    <div style="background:#0d0d0d;padding:40px 16px;font-family:Helvetica,Arial,sans-serif;">
      <table role="presentation" width="100%" style="max-width:480px;margin:0 auto;background:#1c1c1c;border-radius:18px;overflow:hidden;border:1px solid rgba(255,255,255,0.08);box-shadow:0 1px 3px rgba(0,0,0,0.4);">
        <tr>
          <td style="height:4px;background:${accent.bar};"></td>
        </tr>
        <tr>
          <td style="padding:28px 32px 0;">
            <table role="presentation">
              <tr>
                <td style="vertical-align:middle;padding-right:9px;">
                  <span style="display:inline-block;width:26px;height:26px;line-height:26px;text-align:center;border-radius:50%;background:rgba(255,128,0,0.12);border:1px solid rgba(255,128,0,0.35);color:#ff8000;font-size:14px;">♪</span>
                </td>
                <td style="vertical-align:middle;">
                  <span style="font-size:12px;letter-spacing:2.5px;text-transform:uppercase;color:#f5f5f5;font-weight:bold;">Bass Note <span style="color:#ff8000;">Piano</span></span>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 32px 8px;">
            <h1 style="margin:0 0 16px;font-size:21px;font-family:Georgia,'Times New Roman',serif;color:#f5f5f5;">${escapeHtml(title)}</h1>
            <div style="font-size:15px;line-height:1.65;color:#c2c2c2;">
              ${bodyHtml}
            </div>
          </td>
        </tr>
        <tr>
          <td style="padding:22px 32px 28px;border-top:1px solid rgba(255,255,255,0.08);">
            <p style="margin:0 0 6px;font-size:12px;line-height:1.6;color:#999999;">
              ${footerNote}
            </p>
            <p style="margin:0;font-size:12px;line-height:1.6;color:#999999;">
              Questions? Write to <a href="mailto:${EMAIL_REPLY_TO}" style="color:#ff8000;text-decoration:underline;">${EMAIL_REPLY_TO}</a>.
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
      <span style="display:inline-block;padding:14px 28px;border-radius:12px;background:#1f140a;border:1px solid rgba(255,128,0,0.35);font-family:'Courier New',monospace;font-size:28px;letter-spacing:8px;font-weight:bold;color:#ff8000;">
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
  DELETE_ACCOUNT: {
    subject: "Confirm account deletion — Bass Note Piano",
    heading: "Confirm account deletion",
    intro:
      "Enter this code to permanently delete your account. This can't be undone — if you didn't request this, do not share this code with anyone.",
  },
};

export async function sendVerificationCodeEmail(to: string, purpose: VerificationPurpose, code: string) {
  const copy = PURPOSE_COPY[purpose];
  const html = emailShell(
    copy.heading,
    `<p style="margin:0 0 4px;">${copy.intro}</p>${codeBlockHtml(code)}<p style="margin:0;color:#999999;font-size:13px;">This code expires in 10 minutes.</p>`,
    // Codes are a different concern than a "manage preferences" footer — the
    // relevant reassurance here is "someone else can't get in", not "opt out".
    { footerNote: "If you didn't request this, you can safely ignore this email — your account is still secure." },
  );
  const text = `${copy.intro}\n\nYour code: ${code}\n\nThis code expires in 10 minutes.`;
  await sendEmail({ to, subject: copy.subject, html, text });
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Generic notification email — payment approvals, role changes, practice reminders, etc. */
export async function sendNotificationEmail(to: string, title: string, body: string, kind: "default" | "notice" = "default") {
  const html = emailShell(title, `<p style="margin:0;">${escapeHtml(body)}</p>`, { kind });
  const text = body;
  await sendEmail({ to, subject: `${title} — Bass Note Piano`, html, text });
}

function ctaButtonHtml(cta: { label: string; url: string }): string {
  return `
    <div style="text-align:center;margin-top:4px;">
      <a href="${cta.url}" style="display:inline-block;padding:13px 30px;border-radius:10px;background:#ff8000;color:#0d0d0d;font-size:14px;font-weight:bold;text-decoration:none;">
        ${escapeHtml(cta.label)}
      </a>
    </div>
  `;
}

/**
 * Same as sendNotificationEmail, plus a single call-to-action button/link
 * tailored to what the notification is about — e.g. "Click here to reply"
 * deep-linked to the actual thread, not just a generic "open the app."
 */
export async function sendNotificationEmailWithCta(
  to: string,
  title: string,
  body: string,
  cta: { label: string; url: string },
  kind: "default" | "notice" = "default",
) {
  const html = emailShell(title, `<p style="margin:0 0 20px;">${escapeHtml(body)}</p>${ctaButtonHtml(cta)}`, { kind });
  const text = `${body}\n\n${cta.label}: ${cta.url}`;
  await sendEmail({ to, subject: `${title} — Bass Note Piano`, html, text });
}

/** First-time-only welcome email, fired the moment email verification succeeds (see verify-email/actions.ts). */
export async function sendWelcomeEmail(to: string, name: string | null) {
  const firstName = name?.trim().split(" ")[0];
  const greeting = firstName ? `Welcome, ${escapeHtml(firstName)}!` : "Welcome!";
  const body =
    "Your account is verified and ready to go. Explore the six-scale Ethiopian curriculum, book a live Discord class, or just look around — here's a quick tour of what's here.";
  const html = emailShell(greeting, `<p style="margin:0 0 20px;">${body}</p>${ctaButtonHtml({ label: "Learn more about Bass Note Piano", url: getAppUrl("/about") })}`);
  const text = `${greeting}\n\n${body}\n\nLearn more: ${getAppUrl("/about")}`;
  await sendEmail({ to, subject: "Welcome to Bass Note Piano 🎹", html, text });
}


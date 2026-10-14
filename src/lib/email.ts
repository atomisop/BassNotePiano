import { Resend } from "resend";
import type { VerificationPurpose } from "@prisma/client";
import { SCALE_GROUPS } from "@/lib/curriculum";

// Falls back to the actual verified Resend sending domain (a subdomain, not
// the root domain; see the deployment notes) so a missing env var fails
// the same way production is actually configured, rather than to an
// unverified address Resend would just bounce.
// The one automatic sender. A stale EMAIL_FROM still pointing at the retired noreply subdomain is ignored.
const NOREPLY_FROM = "Bass Note Piano <noreply@bassnotepiano.com>";
const EMAIL_FROM = process.env.EMAIL_FROM && !process.env.EMAIL_FROM.includes("@noreply.") ? process.env.EMAIL_FROM : NOREPLY_FROM;
// Real inbox (Squarespace-forwarded), not the noreply sender above. Set so
// hitting "reply" on any app email actually reaches someone, and the
// footer has a real contact address rather than just a link back into the
// app. Not a substitute for the physical mailing address CAN-SPAM
// requires (that's still pending); this just closes the "there's no way to
// write back" gap in the meantime.
const EMAIL_REPLY_TO = process.env.EMAIL_REPLY_TO ?? "music@bassnotepiano.com";
// The physical mailing address CAN-SPAM asks for. Set MAILING_ADDRESS in the environment and it shows in every email footer.
// Messages typed by a person (announcements, direct messages) come from an address people can answer.
// A normal-looking, reply-able sender is far less likely to be filed under Promotions than a noreply one.
const PERSONAL_FROM = process.env.PERSONAL_EMAIL_FROM ?? "Bass Note Piano <music@bassnotepiano.com>";
const MAILING_ADDRESS = process.env.MAILING_ADDRESS?.trim() ?? "";

/** Builds an absolute in-app URL for an email link, NEXTAUTH_URL has no trailing slash (matches every other usage of it in this codebase). */
export function getAppUrl(path: string): string {
  return `${process.env.NEXTAUTH_URL}${path}`;
}

// Lazily constructed, a missing key shouldn't crash module load (import
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
  /** Overrides the sender. Messages from a person use a reply-able address, see sendPersonalEmail. */
  from?: string;
}

/**
 * The single send path for every transactional email in the app. Without
 * RESEND_API_KEY (local dev, or before it's configured in production) this
 * logs the email to the server console instead of sending, the whole
 * verification/2FA/reset flow is fully testable without real credentials.
 */
async function sendEmail({ to, subject, html, text, from }: SendEmailParams): Promise<void> {
  const client = getResendClient();

  if (!client) {
    // Never log a message body in production: these emails carry sign-in and
    // reset codes, and a missing key must not turn the host's log stream into
    // a place to read them.
    if (process.env.NODE_ENV === "production") {
      throw new Error("RESEND_API_KEY is not set; refusing to send or log an email in production.");
    }
    console.log(
      [
        "",
        "=".repeat(60),
        "📧  EMAIL (dev mode: RESEND_API_KEY not set, not actually sent)",
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

  // Try the wanted sender first, then the standard one, then the root-domain one. A sender whose domain
  // is not verified for this Resend key is refused, and the message should still go out.
  const senders = Array.from(new Set([from ?? EMAIL_FROM, EMAIL_FROM, NOREPLY_FROM]));
  let result = await client.emails.send({ from: senders[0], to, subject, html, text, replyTo: EMAIL_REPLY_TO });
  for (const next of senders.slice(1)) {
    if (!result.error) break;
    console.error(`Sending from ${senders[0]} failed (${result.error.message}), trying ${next}.`);
    result = await client.emails.send({ from: next, to, subject, html, text, replyTo: EMAIL_REPLY_TO });
  }
  if (result.error) {
    throw new Error(`Resend failed to send to ${to}: ${result.error.message}`);
  }
}

// Accent per email "kind", the default is neutral, not the house accent
// (src/app/themes.css's Instagram-style purple→pink→orange, see that
// file's own "Accent" comment for the full history): the "premium black
// and white" pass covers every email touchpoint now, including the real
// CTA button below (`cta.url`, see `ctaButtonHtml`'s own comment), there's
// no colour left anywhere in these emails. A cancellation/rejection still
// gets its own warm red, that one isn't about the accent at all, just
// keeping a rejection from reading as "this went well" (same
// --c-rd-300/400 red the app itself uses for errors).
const SHELL_ACCENT = {
  default: { bar: "linear-gradient(90deg,#e86f42,#fb8a5c,#fdb28a)", dot: "#fb8a5c" },
  notice: { bar: "linear-gradient(90deg,#ef4444,#fca5a5,#ef4444)", dot: "#ef4444" },
} as const;

interface EmailShellOptions {
  kind?: keyof typeof SHELL_ACCENT;
  /** Overrides the default "manage preferences" footer line, used by code emails, which have a different (ignore-if-not-you) concern. */
  footerNote?: string;
}

function emailShell(title: string, bodyHtml: string, options: EmailShellOptions = {}): string {
  const accent = SHELL_ACCENT[options.kind ?? "default"];
  const footerNote =
    options.footerNote ??
    `You're getting this because you have a Bass Note Piano account. <a href="${getAppUrl("/account?tab=notifications")}" style="color:#f5f5f5;text-decoration:underline;">Manage email preferences</a>.`;

  return `
    <div style="background:#0d0d0d;padding:40px 16px;font-family:Helvetica,Arial,sans-serif;">
      <table role="presentation" width="100%" style="max-width:480px;margin:0 auto;background:#1c1c1c;border-radius:18px;overflow:hidden;border:1px solid rgba(255,255,255,0.08);box-shadow:0 1px 3px rgba(0,0,0,0.4);">
        <tr>
          <td style="height:4px;background:${accent.bar};"></td>
        </tr>
        <tr>
          <td align="center" style="padding:30px 32px 0;">
            <img src="${getAppUrl("/logo-mark.png")}" width="72" height="72" alt="Bass Note Piano" style="display:block;width:72px;height:72px;border:0;border-radius:36px;margin:0 auto;" />
            <span style="display:block;margin-top:12px;font-size:12px;letter-spacing:2.5px;text-transform:uppercase;color:#f5f5f5;font-weight:bold;">Bass Note Piano</span>
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
              Questions? Write to <a href="mailto:${EMAIL_REPLY_TO}" style="color:#f5f5f5;text-decoration:underline;">${EMAIL_REPLY_TO}</a>.
            </p>
            ${MAILING_ADDRESS ? `<p style="margin:6px 0 0;font-size:12px;line-height:1.6;color:#999999;">${escapeHtml(MAILING_ADDRESS)}</p>` : ""}
          </td>
        </tr>
      </table>
    </div>
  `;
}

function codeBlockHtml(code: string): string {
  // Neutral, not accent-tinted, the code is information to copy, not a
  // call-to-action, and it's already the single largest, boldest thing in
  // the email; size and weight carry the emphasis, not colour.
  return `
    <div style="margin:20px 0;text-align:center;">
      <span style="display:inline-block;padding:14px 28px;border-radius:12px;background:#262626;border:1px solid rgba(245,245,245,0.25);font-family:'Courier New',monospace;font-size:28px;letter-spacing:8px;font-weight:bold;color:#f5f5f5;">
        ${code}
      </span>
    </div>
  `;
}

const PURPOSE_COPY: Record<VerificationPurpose, { subject: string; heading: string; intro: string }> = {
  EMAIL_VERIFY: {
    subject: "Verify your email",
    heading: "Confirm your email",
    intro: "Welcome to Bass Note Piano. Enter this code to verify your email and finish creating your account.",
  },
  LOGIN_2FA: {
    subject: "Your login code",
    heading: "Confirm it's you",
    intro: "Enter this code to finish logging in.",
  },
  PASSWORD_RESET: {
    subject: "Reset your password",
    heading: "Reset your password",
    intro: "Enter this code to choose a new password.",
  },
  CHANGE_PASSWORD: {
    subject: "Confirm your password change",
    heading: "Confirm password change",
    intro: "Enter this code to confirm you'd like to change your account password.",
  },
  CHANGE_NAME: {
    subject: "Confirm your name change",
    heading: "Confirm name change",
    intro: "Enter this code to confirm your new display name.",
  },
  CHANGE_AVATAR: {
    subject: "Confirm your profile photo change",
    heading: "Confirm photo change",
    intro: "Enter this code to confirm your new profile photo.",
  },
  // Phone codes go by text (see createAndSendCode), so this email copy is never sent; the record needs an entry anyway.
  PHONE_VERIFY: {
    subject: "Confirm your phone number",
    heading: "Confirm your phone number",
    intro: "Enter this code to confirm your phone number.",
  },
  SWITCH_TO_FAMILY: {
    subject: "Confirm your switch to a family plan",
    heading: "Confirm your switch to a family plan",
    intro:
      "Enter this code to switch your plan to a family plan. Your current plan is cancelled when the family's first payment is approved. If you didn't request this, do not share this code with anyone.",
  },
  DELETE_ACCOUNT: {
    subject: "Confirm account deletion",
    heading: "Confirm account deletion",
    intro:
      "Enter this code to permanently delete your account. This can't be undone. If you didn't request this, do not share this code with anyone.",
  },
};

export async function sendVerificationCodeEmail(to: string, purpose: VerificationPurpose, code: string) {
  const copy = PURPOSE_COPY[purpose];
  const html = emailShell(
    copy.heading,
    `<p style="margin:0 0 4px;">${copy.intro}</p>${codeBlockHtml(code)}<p style="margin:0;color:#999999;font-size:13px;">This code expires in 10 minutes.</p>`,
    // Codes are a different concern than a "manage preferences" footer, the
    // relevant reassurance here is "someone else can't get in", not "opt out".
    { footerNote: "If you didn't request this, you can safely ignore this email. Your account is still secure." },
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

/** Generic notification email, payment approvals, role changes, practice reminders, etc. */
export async function sendNotificationEmail(to: string, title: string, body: string, kind: "default" | "notice" = "default") {
  const html = emailShell(title, `<p style="margin:0;">${escapeHtml(body)}</p>`, { kind });
  const text = body;
  await sendEmail({ to, subject: title, html, text });
}

/** Where to make a Discord account. */
export const DISCORD_REGISTER_URL = "https://discord.com/register";

/**
 * Tells a student to connect Discord, in three short steps with the two links in the text. Sent by the owner from Admin >
 * Discord (the Notify button). Direct on purpose: no extra information.
 */
export async function sendDiscordConnectEmail(to: string): Promise<void> {
  const lessonsUrl = getAppUrl("/lessons");
  const link = (url: string) => `<a href="${url}" style="color:#fb8a5c;text-decoration:underline;font-weight:bold;">here</a>`;
  const html = emailShell(
    "Connect your Discord",
    `<p style="margin:0 0 14px;">Your class calls happen on Discord. Do these 3 steps:</p>
     <p style="margin:0 0 10px;">1. Download the free Discord app on your phone.</p>
     <p style="margin:0 0 10px;">2. Create a Discord account ${link(DISCORD_REGISTER_URL)}.</p>
     <p style="margin:0;">3. Open Lessons and tap Connect Discord ${link(lessonsUrl)}.</p>`,
  );
  const text = `Your class calls happen on Discord. Do these 3 steps:

1. Download the free Discord app on your phone.
2. Create a Discord account here: ${DISCORD_REGISTER_URL}
3. Open Lessons and tap Connect Discord here: ${lessonsUrl}`;
  await sendEmail({ to, subject: "Connect your Discord", html, text });
}

/** Security notice after a password change or reset. Sent from the standard noreply sender. */
export async function sendPasswordChangedEmail(to: string, name: string | null) {
  const greeting = name ? `Hi ${escapeHtml(name.split(" ")[0])},` : "Hi,";
  const resetUrl = getAppUrl("/forgot-password");
  const html = emailShell(
    "Your password was changed",
    `<p style="margin:0 0 12px;">${greeting}</p><p style="margin:0 0 12px;">The password on your Bass Note Piano account was just changed, and any other devices were signed out.</p><p style="margin:0;">If this was you, nothing more to do. If it wasn't, <a href="${resetUrl}">reset your password now</a> and reply to the studio so we can look into it.</p>`,
    { kind: "notice" },
  );
  const text = `${name ? `Hi ${name.split(" ")[0]},` : "Hi,"}\n\nThe password on your Bass Note Piano account was just changed, and any other devices were signed out.\n\nIf this was you, nothing more to do. If it wasn't, reset your password now: ${resetUrl}\nand reply to the studio so we can look into it.`;
  await sendEmail({ to, subject: "Your password was changed", html, text });
}

/**
 * A message from a person, not a template. Used for announcements and for the
 * messages the owner types to students: plain paragraphs, a greeting by name,
 * one plain link at most, no logo, colours or buttons. Gmail files heavily
 * designed bulk-looking mail under Promotions, and mail that reads like a
 * note from someone lands in the inbox far more often.
 */
export async function sendPersonalEmail(
  to: string,
  subject: string,
  body: string,
  options: { firstName?: string | null; link?: { label: string; url: string } } = {},
) {
  const greeting = options.firstName?.trim() ? `Hi ${options.firstName.trim()},` : "Hi,";
  const paragraphs = body
    .trim()
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  const linkHtml = options.link ? `<p style="margin:0 0 14px;"><a href="${options.link.url}">${escapeHtml(options.link.label)}</a></p>` : "";
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#222222;">
<p style="margin:0 0 14px;">${escapeHtml(greeting)}</p>
${paragraphs.map((p) => `<p style="margin:0 0 14px;">${escapeHtml(p).replace(/\n/g, "<br>")}</p>`).join("\n")}
${linkHtml}<p style="margin:0;">Bass Note Piano</p>
</div>`;
  const text = [greeting, "", ...paragraphs.flatMap((p) => [p, ""]), ...(options.link ? [`${options.link.label}: ${options.link.url}`, ""] : []), "Bass Note Piano"].join("\n");
  await sendEmail({ to, subject, html, text, from: PERSONAL_FROM });
}

function ctaButtonHtml(cta: { label: string; url: string }): string {
  // Neutral, not accent, the "premium black and white" pass now covers
  // real CTAs too, so nothing in the app fills a button with the accent
  // gradient anymore.
  return `
    <div style="text-align:center;margin-top:4px;">
      <a href="${cta.url}" style="display:inline-block;padding:13px 30px;border-radius:10px;background:#fb8a5c;color:#1a140e;font-size:14px;font-weight:bold;text-decoration:none;">
        ${escapeHtml(cta.label)}
      </a>
    </div>
  `;
}

/**
 * Same as sendNotificationEmail, plus a single call-to-action button/link
 * tailored to what the notification is about, e.g. "Click here to reply"
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
  await sendEmail({ to, subject: title, html, text });
}

function formatUsdCents(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export interface PaymentPlanInvoiceDetails {
  /** e.g. "6-Month plan, 60 min/week" */
  planLabel: string;
  /** e.g. "Installment 3 of 6" */
  installmentLabel: string;
  amountCents: number;
  dueDate: Date;
  zelleHandle: string;
  cta: { label: string; url: string };
  /** When this installment's credits (and the exclusive hold on the student's reserved weekly slot) actually lapse if unused, computed the same way the CreditGrant itself is (addCalendarMonthsClamped(plan.nextDueDate, 1), already known ahead of approval since only approval advances nextDueDate). Optional and rendered as one more summary row only when present, so a caller that doesn't have it handy doesn't need to fake one. */
  cycleEndsAt?: Date;
  /** Present only for the overdue variant, its presence, not a separate flag, is what picks the template's copy/accent. */
  overdueDays?: number;
}

/**
 * The one dedicated "invoice" email in this app, every other transactional
 * email goes through sendNotificationEmail(WithCta) above, whose body is a
 * single plain paragraph and can't carry an itemized amount/due-date/Zelle
 * summary. One template serves both the due-soon (kind: "default") and
 * overdue (kind: "notice", the existing red accent) cases, an overdue
 * reminder is just "resend the same invoice, more urgently," not a
 * different layout. See netlify/functions/payment-plan-installments.ts for
 * the scheduled job that calls this.
 */
export async function sendPaymentPlanInvoiceEmail(to: string, details: PaymentPlanInvoiceDetails): Promise<void> {
  const isOverdue = typeof details.overdueDays === "number";
  const heading = isOverdue ? "Overdue bill" : "Your bill";
  const dueDateLabel = details.dueDate.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "America/New_York" });
  const dueShort = details.dueDate.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" });
  const amountLabel = formatUsdCents(details.amountCents);
  const dueIso = details.dueDate.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  const remindUrl = getAppUrl(`/api/reminders/installment?d=${dueIso}&a=${details.amountCents}`);
  const intro = isOverdue
    ? `This bill is ${details.overdueDays} day${details.overdueDays === 1 ? "" : "s"} overdue. Please send it as soon as you can.`
    : `${details.planLabel}, ${details.installmentLabel.toLowerCase()}.`;

  const rowBorder = "border-top:1px solid rgba(255,255,255,0.08);";
  const cycleEndsAtLabel = details.cycleEndsAt?.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "America/New_York" });

  // The two lines that matter, large, the way a bill reads: how much and by when.
  const headlineHtml = `
    <p style="margin:0 0 6px;color:#999999;font-size:13px;">${escapeHtml(intro)}</p>
    <p style="margin:0;color:#f5f5f5;font-size:34px;font-weight:bold;line-height:1.1;">${amountLabel}</p>
    <p style="margin:6px 0 20px;color:${isOverdue ? "#fca5a5" : "#f5f5f5"};font-size:17px;font-weight:bold;">${isOverdue ? "was due" : "due on"} ${escapeHtml(dueDateLabel)}</p>
  `;

  const buttonsHtml = `
    <table role="presentation" width="100%" style="border-collapse:collapse;margin:0 0 22px;">
      <tr>
        <td style="padding-right:8px;">
          <a href="${details.cta.url}" style="display:block;padding:13px 10px;border-radius:999px;background:#fb8a5c;color:#1a140e;font-size:14px;font-weight:bold;text-align:center;text-decoration:none;">Pay bill</a>
        </td>
        <td style="padding-left:8px;">
          <a href="${remindUrl}" style="display:block;padding:13px 10px;border-radius:999px;background:#2a2a2a;color:#f5f5f5;font-size:14px;font-weight:bold;text-align:center;text-decoration:none;">Remind me</a>
        </td>
      </tr>
    </table>
  `;

  const summaryHtml = `
    <table role="presentation" width="100%" style="margin:0;border-collapse:collapse;">
      <tr>
        <td style="padding:6px 0;color:#999999;font-size:13px;">Plan</td>
        <td style="padding:6px 0;color:#f5f5f5;font-size:13px;text-align:right;">${escapeHtml(details.planLabel)}</td>
      </tr>
      <tr>
        <td style="padding:6px 0;color:#999999;font-size:13px;${rowBorder}">Installment</td>
        <td style="padding:6px 0;color:#f5f5f5;font-size:13px;text-align:right;${rowBorder}">${escapeHtml(details.installmentLabel)}</td>
      </tr>
      ${
        cycleEndsAtLabel
          ? `<tr>
        <td style="padding:6px 0;color:#999999;font-size:13px;${rowBorder}">Credits valid through</td>
        <td style="padding:6px 0;color:#f5f5f5;font-size:13px;text-align:right;${rowBorder}">${escapeHtml(cycleEndsAtLabel)}</td>
      </tr>`
          : ""
      }
      <tr>
        <td style="padding:6px 0;color:#999999;font-size:13px;${rowBorder}">Pay via Zelle to</td>
        <td style="padding:6px 0;color:#f5f5f5;font-size:13px;text-align:right;${rowBorder}">${escapeHtml(details.zelleHandle)}</td>
      </tr>
    </table>
  `;

  const html = emailShell(heading, `${headlineHtml}${buttonsHtml}${summaryHtml}`, { kind: isOverdue ? "notice" : "default" });
  const text = [
    `${heading}: ${amountLabel} ${isOverdue ? "was due" : "due on"} ${dueDateLabel}`,
    intro,
    "",
    `Plan: ${details.planLabel}`,
    `Installment: ${details.installmentLabel}`,
    ...(cycleEndsAtLabel ? [`Credits valid through: ${cycleEndsAtLabel}`] : []),
    `Pay via Zelle to: ${details.zelleHandle}`,
    "",
    `Pay bill: ${details.cta.url}`,
    `Remind me: ${remindUrl}`,
  ].join("\n");

  await sendEmail({
    to,
    subject: isOverdue ? `Overdue: ${amountLabel} bill` : `Bill: ${amountLabel} due ${dueShort}`,
    html,
    text,
  });
}

/** First-time-only welcome email, fired the moment email verification succeeds (see verify-email/actions.ts). */
export async function sendWelcomeEmail(to: string, name: string | null) {
  const firstName = name?.trim().split(" ")[0];
  const greeting = firstName ? `Welcome, ${escapeHtml(firstName)}!` : "Welcome!";
  const scaleCount = SCALE_GROUPS.length;

  const things = [
    `${scaleCount} Ethiopian scales, spelled correctly in every key`,
    "Live one-on-one classes with your teacher on Discord",
    "A virtual piano, guitar and bass that play every scale for you",
    "Ten minutes of daily finger exercises, with streak badges to earn",
    "Friends, messages, and Atom, our assistant, for quick questions",
  ];
  const steps = [
    { label: "Finish your profile", detail: "Add a photo and a username so friends can find you.", url: getAppUrl("/profile") },
    { label: "Pick a class plan and a weekly time", detail: "Your curriculum opens with your live classes, one scale at a time.", url: getAppUrl("/billing/plans") },
    { label: "Try today's finger exercises", detail: "Ten minutes is all it takes to unlock your lessons for the day.", url: getAppUrl("/practice") },
    { label: "Say hi to Atom", detail: "Ask anything about classes, pricing or how things work.", url: getAppUrl("/dashboard") },
  ];

  const listStyle = "margin:0 0 20px;padding-left:20px;color:#e5e5e5;line-height:1.7;";
  const bodyHtml = `
    <p style="margin:0 0 16px;">Your email is verified and your account is ready. We're so glad you're here.</p>
    <p style="margin:0 0 8px;font-weight:bold;color:#f5f5f5;">What you get</p>
    <ul style="${listStyle}">${things.map((t) => `<li>${escapeHtml(t)}</li>`).join("")}</ul>
    <p style="margin:0 0 8px;font-weight:bold;color:#f5f5f5;">A few good next steps</p>
    <ol style="${listStyle}">${steps
      .map((st) => `<li><a href="${st.url}" style="color:#fb8a5c;text-decoration:none;font-weight:bold;">${escapeHtml(st.label)}</a><br /><span style="color:#a3a3a3;">${escapeHtml(st.detail)}</span></li>`)
      .join("")}</ol>
    <p style="margin:0 0 20px;">Take it one scale at a time. There's no rush, and we're here whenever you need us.</p>
    ${ctaButtonHtml({ label: "Open Bass Note Piano", url: getAppUrl("/dashboard") })}
  `;
  const html = emailShell(greeting, bodyHtml);
  const text = [
    greeting.replace(/&[a-z#0-9]+;/gi, ""),
    "",
    "Your email is verified and your account is ready. We're so glad you're here.",
    "",
    "What you get:",
    ...things.map((t) => `- ${t}`),
    "",
    "A few good next steps:",
    ...steps.map((st, i) => `${i + 1}. ${st.label}: ${st.detail} ${st.url}`),
    "",
    "Take it one scale at a time. There's no rush, and we're here whenever you need us.",
    "",
    `Open Bass Note Piano: ${getAppUrl("/dashboard")}`,
  ].join("\n");
  await sendEmail({ to, subject: "Welcome to Bass Note Piano \u{1F389}", html, text });
}

/**
 * An admin's reply to an email thread in Support Chat's Email tab. Goes out as
 * music@bassnotepiano.com and plain, like a person wrote it. `messageId`,
 * `inReplyTo` and `references` keep it in the customer's thread, and their
 * answer comes back to music@, where the Mailgun route hands it to the site.
 * Throws when it cannot send, so the thread never shows a reply nobody got.
 */
export async function sendSupportEmailReply(input: {
  to: string;
  subject: string;
  text: string;
  /** The Message-ID this reply is sent with, kept so the customer's answer can be matched to the thread. */
  messageId: string;
  inReplyTo: string | null;
  references: string[];
}): Promise<void> {
  const { to, subject, text, messageId, inReplyTo, references } = input;
  const client = getResendClient();
  if (!client) {
    if (process.env.NODE_ENV === "production") throw new Error("RESEND_API_KEY is not set.");
    console.log(`[dev] Support email reply to ${to}: ${subject}\n${text}`);
    return;
  }
  const html = `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#111;white-space:pre-wrap;">${escapeHtml(text)}</div>`;
  const headers: Record<string, string> = { "Message-ID": messageId };
  if (inReplyTo) headers["In-Reply-To"] = inReplyTo;
  if (references.length > 0) headers["References"] = references.join(" ");
  const result = await client.emails.send({ from: PERSONAL_FROM, to, subject, html, text, replyTo: EMAIL_REPLY_TO, headers });
  if (result.error) throw new Error(`Resend failed to send a support reply: ${result.error.message}`);
}

/** The daily test email that proves the studio inbox chain (forwarding, filter, Mailgun, site) still delivers. */
export async function sendMailChainProbe(token: string): Promise<void> {
  const subject = `BNP mail check ${token}`;
  const text = "This is the daily automatic check that email to music@ still reaches the site. Nobody needs to read or answer it.";
  await sendEmail({ to: "music@bassnotepiano.com", subject, html: `<p>${text}</p>`, text, from: PERSONAL_FROM });
}

export interface TodoEmailItem {
  text: string;
  url: string;
}

/** The owner's morning list: one line per thing, each a link straight to the page that handles it. */
export async function sendTodoListEmail(to: string, title: string, intro: string | null, items: TodoEmailItem[]) {
  const rows = items
    .map(
      (item) =>
        `<li style="margin:0 0 10px;"><a href="${item.url}" style="color:#f5f5f5;text-decoration:underline;">${escapeHtml(item.text)}</a></li>`,
    )
    .join("");
  const html = emailShell(
    title,
    `${intro ? `<p style="margin:0 0 14px;">${escapeHtml(intro)}</p>` : ""}<ul style="margin:0 0 20px;padding-left:20px;">${rows}</ul>${ctaButtonHtml({ label: "Open admin", url: getAppUrl("/admin") })}`,
  );
  const text = [intro, ...items.map((i) => `- ${i.text}: ${i.url}`), "", `Open admin: ${getAppUrl("/admin")}`].filter((l): l is string => l !== null).join("\n");
  await sendEmail({ to, subject: title, html, text });
}

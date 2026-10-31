import { Resend } from "resend";
import { isStaging, stagingMayEmail } from "@/lib/appEnv";
import { tagAppLinks } from "@/lib/recipientTag";
import { reservationEmailBody } from "@/lib/reservationEmail";
import type { VerificationPurpose } from "@prisma/client";
import { SCALE_GROUPS } from "@/lib/curriculum";
import type { EmailCategory } from "@/lib/emailPreferences";
import { unsubscribeLinks } from "@/lib/unsubscribe";
import { recordEmail } from "@/lib/emailLog";
import type { Receipt } from "@/lib/paymentReceiptRules";

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

/** Who an email is for and which switch governs it, so the email can carry a working "Unsubscribe" (see unsubscribe.ts). */
export interface UnsubscribeTarget {
  userId: string;
  category: EmailCategory;
}

interface SendEmailParams {
  to: string;
  /** The one-click unsubscribe endpoint, sent as the List-Unsubscribe header (RFC 8058) so mail apps can show their own button. */
  unsubscribePostUrl?: string;
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
async function sendEmail({ to, subject, html: rawHtml, text: rawText, from, unsubscribePostUrl }: SendEmailParams): Promise<void> {
  // Every link into the app is tagged with who the email is for, so opening it signed in as someone else is caught
  // (see recipientTag.ts and the middleware) instead of showing that other account's screen.
  const html = await tagAppLinks(rawHtml, to);
  const text = await tagAppLinks(rawText, to);
  const client = getResendClient();

  // The staging copy never emails real people: only the test allow-list, and never throws for a missing key. Only the subject is logged
  // (bodies carry sign-in codes).
  if (isStaging() && (!client || !stagingMayEmail(to))) {
    console.log(`[staging] email to ${to} not sent: ${subject}`);
    await recordEmail({ to, subject, status: "SKIPPED", detail: "Staging copy: only test addresses get email" });
    return;
  }

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
    await recordEmail({ to, subject, status: "SKIPPED", detail: "Development: no email key, printed to the server log" });
    return;
  }

  // Try the wanted sender first, then the standard one, then the root-domain one. A sender whose domain
  // is not verified for this Resend key is refused, and the message should still go out.
  const senders = Array.from(new Set([from ?? EMAIL_FROM, EMAIL_FROM, NOREPLY_FROM]));
  const headers = unsubscribePostUrl ? { "List-Unsubscribe": `<${unsubscribePostUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } : undefined;
  let result = await client.emails.send({ from: senders[0], to, subject, html, text, replyTo: EMAIL_REPLY_TO, headers });
  for (const next of senders.slice(1)) {
    if (!result.error) break;
    console.error(`Sending from ${senders[0]} failed (${result.error.message}), trying ${next}.`);
    result = await client.emails.send({ from: next, to, subject, html, text, replyTo: EMAIL_REPLY_TO, headers });
  }
  if (result.error) {
    await recordEmail({ to, subject, status: "FAILED", detail: result.error.message });
    throw new Error(`Resend failed to send to ${to}: ${result.error.message}`);
  }
  // Resend's id for this email: its webhook reports delivered, opened and bounced against it.
  await recordEmail({ to, subject, status: "SENT", resendId: result.data?.id ?? null });
}

// One light, clean layout for every designed email: a white card on a soft grey page, the brand
// orange as the single accent, dark text for contrast, and a red accent only for notices (a security
// change, an overdue bill) so those never read as "this went well". Light on purpose: it reads the
// same in every mail app, and dark-mode clients that invert it still keep the text legible.
const MAIL = {
  page: "#f3f4f6",
  card: "#ffffff",
  ink: "#111827",
  body: "#374151",
  muted: "#6b7280",
  line: "#e5e7eb",
  panel: "#f9fafb",
  brand: "#e86f42",
  brandInk: "#ffffff",
  danger: "#dc2626",
  dangerSoft: "#fef2f2",
} as const;

const SHELL_ACCENT = {
  default: { bar: MAIL.brand, link: "#c2410c" },
  notice: { bar: MAIL.danger, link: MAIL.danger },
} as const;

const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";

interface EmailShellOptions {
  kind?: keyof typeof SHELL_ACCENT;
  /** Overrides the default "manage preferences" footer line, used by code emails, which have a different (ignore-if-not-you) concern. */
  footerNote?: string;
  /** Adds an "Unsubscribe" link to the default footer line (ignored when footerNote replaces it). */
  unsubscribePageUrl?: string;
  /** The grey line mail apps show beside the subject in the inbox list. Hidden in the message itself. */
  preheader?: string;
}

// Dark mode: the inline styles above are the light look every client understands. Clients that follow the
// device's dark setting (Apple Mail, iOS, Outlook, most Gmail apps) also read this block, which swaps the
// same colours for the app's own dark ones. `withDarkClasses` tags each element by the light colours it uses.
const DARK_CLASS_BY_STYLE: [RegExp, string][] = [
  [new RegExp(`background:${MAIL.page}`, "i"), "d-page"],
  [new RegExp(`background:${MAIL.card}`, "i"), "d-card"],
  [new RegExp(`background:${MAIL.panel}`, "i"), "d-panel"],
  [new RegExp(`[^-]color:${MAIL.ink}`, "i"), "d-ink"],
  [new RegExp(`[^-]color:${MAIL.body}`, "i"), "d-body"],
  [new RegExp(`[^-]color:${MAIL.muted}`, "i"), "d-muted"],
  [new RegExp(`[^-]color:${SHELL_ACCENT.default.link}`, "i"), "d-link"],
  [new RegExp(`[^-]color:${MAIL.danger}`, "i"), "d-danger"],
  [new RegExp(`border:1px solid ${MAIL.line}`, "i"), "d-line d-line-t"],
  [new RegExp(`border-top:1px solid ${MAIL.line}`, "i"), "d-line-t"],
];

const DARK_STYLE = `<style>
:root{color-scheme:light dark;supported-color-schemes:light dark;}
@media (prefers-color-scheme: dark){
.d-page{background:#0d0d0d !important;}
.d-card{background:#1c1c1c !important;}
.d-panel{background:#262626 !important;}
.d-ink{color:#f5f5f5 !important;}
.d-body{color:#cfcfcf !important;}
.d-muted{color:#9a9a9a !important;}
.d-link{color:#fb8a5c !important;}
.d-danger{color:#f87171 !important;}
.d-line{border-left-color:#333333 !important;border-right-color:#333333 !important;border-bottom-color:#333333 !important;}
.d-line-t{border-top-color:#333333 !important;}
}
</style>`;

function withDarkClasses(html: string): string {
  return html.replace(/<([a-z0-9]+)((?:\s[^<>]*?)?)\sstyle="([^"]*)"/gi, (whole, tag: string, before: string, style: string) => {
    const probe = ` ${style}`;
    const classes = DARK_CLASS_BY_STYLE.filter(([re]) => re.test(probe)).map(([, c]) => c).join(" ");
    return classes ? `<${tag}${before} class="${classes}" style="${style}"` : whole;
  });
}

function emailShell(title: string, bodyHtml: string, options: EmailShellOptions = {}): string {
  const accent = SHELL_ACCENT[options.kind ?? "default"];
  const linkStyle = `color:${MAIL.muted};text-decoration:underline;`;
  const footerNote =
    options.footerNote ??
    `You're getting this because you have a Bass Note Piano account. <a href="${getAppUrl("/account?tab=notifications")}" style="${linkStyle}">Manage email preferences</a>${
      options.unsubscribePageUrl ? ` or <a href="${options.unsubscribePageUrl}" style="${linkStyle}">unsubscribe from these emails</a>` : ""
    }.`;
  const preheader = options.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all;">${escapeHtml(options.preheader)}&#8203;&zwnj;&nbsp;&#8203;&zwnj;&nbsp;</div>`
    : "";

  return withDarkClasses(`${DARK_STYLE}
    <div style="margin:0;background:${MAIL.page};padding:32px 12px;font-family:${SANS};">
      ${preheader}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;border-collapse:separate;">
        <tr>
          <td align="center" style="padding:0 0 18px;">
            <img src="${getAppUrl("/logo-mark.png")}" width="44" height="44" alt="" style="display:inline-block;vertical-align:middle;width:44px;height:44px;border:0;border-radius:22px;" />
            <span style="display:inline-block;vertical-align:middle;margin-left:10px;font-size:13px;letter-spacing:2px;text-transform:uppercase;color:${MAIL.ink};font-weight:700;">Bass Note Piano</span>
          </td>
        </tr>
        <tr>
          <td style="background:${MAIL.card};border:1px solid ${MAIL.line};border-top:4px solid ${accent.bar};border-radius:14px;padding:32px 32px 30px;">
            <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;font-weight:700;font-family:${SANS};color:${MAIL.ink};">${escapeHtml(title)}</h1>
            <div style="font-size:15px;line-height:1.65;color:${MAIL.body};">
              ${bodyHtml}
            </div>
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:20px 24px 0;">
            <p style="margin:0 0 6px;font-size:12px;line-height:1.6;color:${MAIL.muted};">
              ${footerNote}
            </p>
            <p style="margin:0;font-size:12px;line-height:1.6;color:${MAIL.muted};">
              Questions? Write to <a href="mailto:${EMAIL_REPLY_TO}" style="${linkStyle}">${EMAIL_REPLY_TO}</a>.
            </p>
            ${MAILING_ADDRESS ? `<p style="margin:6px 0 0;font-size:12px;line-height:1.6;color:${MAIL.muted};">${escapeHtml(MAILING_ADDRESS)}</p>` : ""}
          </td>
        </tr>
      </table>
    </div>
  `);
}

/** An in-text link in the accent colour, for the body of a designed email. */
function bodyLink(url: string, label: string, kind: keyof typeof SHELL_ACCENT = "default"): string {
  return `<a href="${url}" style="color:${SHELL_ACCENT[kind].link};text-decoration:underline;font-weight:600;">${label}</a>`;
}

/**
 * Turns a plain-text notification body into email paragraphs: a blank line starts a new paragraph, a single
 * line break stays a line break, and a run of lines starting with "- " becomes a bullet list. Everything is escaped.
 */
export function bodyToHtml(body: string): string {
  const blocks = body.trim().split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  return blocks
    .map((block, i) => {
      const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
      const gap = i === blocks.length - 1 ? "0" : "14px";
      if (lines.length > 0 && lines.every((l) => l.startsWith("- "))) {
        const items = lines.map((l) => `<li style="margin:0 0 6px;">${escapeHtml(l.slice(2))}</li>`).join("");
        return `<ul style="margin:0 0 ${gap};padding-left:20px;">${items}</ul>`;
      }
      return `<p style="margin:0 0 ${gap};">${lines.map(escapeHtml).join("<br />")}</p>`;
    })
    .join("");
}

/** The first sentence or so of a body, for the line mail apps show beside the subject. */
function preheaderFrom(body: string): string {
  const flat = body.replace(/^- /gm, "").replace(/\s+/g, " ").trim();
  return flat.length > 110 ? `${flat.slice(0, 107).trimEnd()}...` : flat;
}

function codeBlockHtml(code: string): string {
  // The code is information to copy, not a call to action: a quiet grey panel, large monospace digits.
  return `
    <div style="margin:22px 0;text-align:center;">
      <span style="display:inline-block;padding:16px 30px;border-radius:12px;background:${MAIL.panel};border:1px solid ${MAIL.line};font-family:'SFMono-Regular',Menlo,Consolas,'Courier New',monospace;font-size:30px;letter-spacing:8px;font-weight:700;color:${MAIL.ink};">
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
    `<p style="margin:0 0 4px;">${copy.intro}</p>${codeBlockHtml(code)}<p style="margin:0;color:${MAIL.muted};font-size:13px;text-align:center;">This code expires in 10 minutes.</p>`,
    // Codes are a different concern than a "manage preferences" footer, the
    // relevant reassurance here is "someone else can't get in", not "opt out".
    { footerNote: "If you didn't request this, you can safely ignore this email. Your account is still secure.", preheader: `Your code is ${code}. It expires in 10 minutes.` },
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
export async function sendNotificationEmail(to: string, title: string, body: string, kind: "default" | "notice" = "default", unsubscribe?: UnsubscribeTarget) {
  const links = unsubscribe ? unsubscribeLinks(unsubscribe.userId, unsubscribe.category) : null;
  const html = emailShell(title, bodyToHtml(body), { kind, unsubscribePageUrl: links?.page, preheader: preheaderFrom(body) });
  const text = links ? `${body}\n\nUnsubscribe: ${links.page}` : body;
  await sendEmail({ to, subject: title, html, text, unsubscribePostUrl: links?.post });
}

/** Where to make a Discord account. */
export const DISCORD_REGISTER_URL = "https://discord.com/register";

/**
 * Tells a student to connect Discord, in three short steps with the two links in the text. Sent by the owner from Admin >
 * Discord (the Notify button). Direct on purpose: no extra information.
 */
export async function sendDiscordConnectEmail(to: string): Promise<void> {
  const lessonsUrl = getAppUrl("/lessons");
  const link = (url: string) => bodyLink(url, "here");
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
    `<p style="margin:0 0 12px;">${greeting}</p><p style="margin:0 0 12px;">The password on your Bass Note Piano account was just changed, and any other devices were signed out.</p><p style="margin:0;">If this was you, nothing more to do. If it wasn't, ${bodyLink(resetUrl, "reset your password now", "notice")} and reply to the studio so we can look into it.</p>`,
    { kind: "notice" },
  );
  const text = `${name ? `Hi ${name.split(" ")[0]},` : "Hi,"}\n\nThe password on your Bass Note Piano account was just changed, and any other devices were signed out.\n\nIf this was you, nothing more to do. If it wasn't, reset your password now: ${resetUrl}\nand reply to the studio so we can look into it.`;
  await sendEmail({ to, subject: "Your password was changed", html, text });
}

/**
 * One security notice. Sent only to the address of an account after something real happened on it, from the standard
 * noreply sender, and not tied to any notification switch (a person cannot opt out of being told their account changed).
 * Every one ends with the "wasn't you" reset link. Nothing in it says whether any other account exists.
 */
async function sendSecurityNotice(to: string, name: string | null, subject: string, what: string) {
  const greeting = name ? `Hi ${escapeHtml(name.split(" ")[0])},` : "Hi,";
  const resetUrl = getAppUrl("/forgot-password");
  const html = emailShell(
    subject,
    `<p style="margin:0 0 12px;">${greeting}</p><p style="margin:0 0 12px;">${escapeHtml(what)}</p><p style="margin:0;">If this was you, nothing more to do. If it wasn't, ${bodyLink(resetUrl, "reset your password now", "notice")} and reply to the studio so we can look into it.</p>`,
    { kind: "notice" },
  );
  const text = `${name ? `Hi ${name.split(" ")[0]},` : "Hi,"}\n\n${what}\n\nIf this was you, nothing more to do. If it wasn't, reset your password now: ${resetUrl}\nand reply to the studio so we can look into it.`;
  await sendEmail({ to, subject, html, text });
}

export async function sendPhoneChangedEmail(to: string, name: string | null, change: "changed" | "removed") {
  await sendSecurityNotice(
    to,
    name,
    change === "removed" ? "The phone number on your account was removed" : "The phone number on your account was changed",
    change === "removed" ? "The phone number on your Bass Note Piano account was just removed." : "The phone number on your Bass Note Piano account was just changed.",
  );
}

/** Goes to the OLD address, so the person who owns it can object. For when changing an account's email is possible. */
export async function sendEmailChangedEmail(oldAddress: string, name: string | null, newAddressHint: string) {
  await sendSecurityNotice(oldAddress, name, "The email on your account was changed", `The email on your Bass Note Piano account was just changed to ${newAddressHint}.`);
}

export async function sendNewDeviceEmail(to: string, name: string | null, deviceLabel: string, whenText: string) {
  await sendSecurityNotice(to, name, "New sign-in to your account", `Your Bass Note Piano account was just signed in to from a browser or device we haven't seen before: ${deviceLabel}, ${whenText}.`);
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
  options: { firstName?: string | null; link?: { label: string; url: string }; unsubscribe?: UnsubscribeTarget } = {},
) {
  const links = options.unsubscribe ? unsubscribeLinks(options.unsubscribe.userId, options.unsubscribe.category) : null;
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
${links ? `<p style="margin:18px 0 0;font-size:12px;color:#666666;">Do not want these emails? <a href="${links.page}" style="color:#666666;">Unsubscribe</a>.</p>` : ""}
</div>`;
  const text = [greeting, "", ...paragraphs.flatMap((p) => [p, ""]), ...(options.link ? [`${options.link.label}: ${options.link.url}`, ""] : []), "Bass Note Piano", ...(links ? ["", `Do not want these emails? Unsubscribe: ${links.page}`] : [])].join("\n");
  await sendEmail({ to, subject, html, text, from: PERSONAL_FROM, unsubscribePostUrl: links?.post });
}

function ctaButtonHtml(cta: { label: string; url: string }): string {
  // Bulletproof button: the colour sits on the link itself, so it holds in clients that drop padding on inline blocks.
  return `
    <div style="text-align:center;margin-top:4px;">
      <a href="${cta.url}" style="display:inline-block;padding:14px 32px;border-radius:10px;background:${MAIL.brand};color:${MAIL.brandInk};font-size:15px;font-weight:700;text-decoration:none;">
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
  unsubscribe?: UnsubscribeTarget,
) {
  const links = unsubscribe ? unsubscribeLinks(unsubscribe.userId, unsubscribe.category) : null;
  const html = emailShell(title, `<div style="margin:0 0 22px;">${bodyToHtml(body)}</div>${ctaButtonHtml(cta)}`, { kind, unsubscribePageUrl: links?.page, preheader: preheaderFrom(body) });
  const text = `${body}\n\n${cta.label}: ${cta.url}${links ? `\n\nUnsubscribe: ${links.page}` : ""}`;
  await sendEmail({ to, subject: title, html, text, unsubscribePostUrl: links?.post });
}

/**
 * Tells a customer the owner kept a class time for them and to start a subscription to claim it. Sent to an address the owner
 * typed, so it carries no unsubscribe link (like an applicant reply) and its button never holds the customer's email: it goes to
 * the plans page for someone with an account, or to sign-up for someone without one.
 */
export async function sendReservationEmail(to: string, input: { name: string; when: string; hasAccount: boolean }): Promise<void> {
  const body = reservationEmailBody({ name: input.name, when: input.when, email: to, hasAccount: input.hasAccount });
  await sendNotificationEmailWithCta(
    to,
    "A class time is reserved for you",
    body,
    { label: "Start your subscription", url: getAppUrl(input.hasAccount ? "/billing/plans" : "/register") },
    "default",
  );
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
  /** Who the bill is for, so it carries a working "Unsubscribe" for the payments switch. */
  unsubscribe?: UnsubscribeTarget;
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

  const rowBorder = `border-top:1px solid ${MAIL.line};`;
  const cycleEndsAtLabel = details.cycleEndsAt?.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "America/New_York" });

  // The two lines that matter, large, the way a bill reads: how much and by when.
  const headlineHtml = `
    <p style="margin:0 0 8px;color:${MAIL.muted};font-size:14px;">${escapeHtml(intro)}</p>
    <p style="margin:0;color:${MAIL.ink};font-size:38px;font-weight:700;line-height:1.1;">${amountLabel}</p>
    <p style="margin:8px 0 22px;color:${isOverdue ? MAIL.danger : MAIL.ink};font-size:16px;font-weight:600;">${isOverdue ? "Was due" : "Due"} ${escapeHtml(dueDateLabel)}</p>
  `;

  const buttonsHtml = `
    <table role="presentation" width="100%" style="border-collapse:collapse;margin:0 0 24px;">
      <tr>
        <td style="padding-right:6px;">
          <a href="${details.cta.url}" style="display:block;padding:14px 10px;border-radius:10px;background:${MAIL.brand};color:${MAIL.brandInk};font-size:15px;font-weight:700;text-align:center;text-decoration:none;">Pay bill</a>
        </td>
        <td style="padding-left:6px;">
          <a href="${remindUrl}" style="display:block;padding:13px 10px;border-radius:10px;background:${MAIL.card};border:1px solid ${MAIL.line};color:${MAIL.ink};font-size:15px;font-weight:600;text-align:center;text-decoration:none;">Remind me</a>
        </td>
      </tr>
    </table>
  `;

  const cell = "padding:10px 14px;font-size:13px;";
  const summaryHtml = `
    <table role="presentation" width="100%" style="margin:0;border-collapse:separate;background:${MAIL.panel};border:1px solid ${MAIL.line};border-radius:10px;">
      <tr>
        <td style="${cell}color:${MAIL.muted};">Plan</td>
        <td style="${cell}color:${MAIL.ink};text-align:right;">${escapeHtml(details.planLabel)}</td>
      </tr>
      <tr>
        <td style="${cell}color:${MAIL.muted};${rowBorder}">Installment</td>
        <td style="${cell}color:${MAIL.ink};text-align:right;${rowBorder}">${escapeHtml(details.installmentLabel)}</td>
      </tr>
      ${
        cycleEndsAtLabel
          ? `<tr>
        <td style="${cell}color:${MAIL.muted};${rowBorder}">Credits valid through</td>
        <td style="${cell}color:${MAIL.ink};text-align:right;${rowBorder}">${escapeHtml(cycleEndsAtLabel)}</td>
      </tr>`
          : ""
      }
      <tr>
        <td style="${cell}color:${MAIL.muted};${rowBorder}">Pay via Zelle to</td>
        <td style="${cell}color:${MAIL.ink};text-align:right;${rowBorder}">${escapeHtml(details.zelleHandle)}</td>
      </tr>
    </table>
  `;

  const links = details.unsubscribe ? unsubscribeLinks(details.unsubscribe.userId, details.unsubscribe.category) : null;
  const html = emailShell(heading, `${headlineHtml}${buttonsHtml}${summaryHtml}`, {
    kind: isOverdue ? "notice" : "default",
    unsubscribePageUrl: links?.page,
    preheader: `${amountLabel} ${isOverdue ? "was due" : "due"} ${dueShort}. Pay by Zelle, or tap to be reminded.`,
  });
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
    ...(links ? ["", `Unsubscribe: ${links.page}`] : []),
  ].join("\n");

  await sendEmail({
    to,
    subject: isOverdue ? `Overdue: ${amountLabel} bill` : `Bill: ${amountLabel} due ${dueShort}`,
    html,
    text,
    unsubscribePostUrl: links?.post,
  });
}

/**
 * The receipt sent when a payment is approved (paymentReceipt.ts builds it). Same layout as the bill above: the amount large, then
 * the one line item and its total, then the details a receipt is kept for (number, date, payer, method, what it covers). A plain
 * "View receipt" button opens the printable copy in the app.
 */
export function renderPaymentReceiptEmail(
  receipt: Receipt,
  opts: { paymentId: string; note?: string; /** The owner's copy: who the original went to. */ copyOf?: { name: string; email: string } },
): { subject: string; html: string; text: string } {
  const receiptUrl = getAppUrl(`/billing/receipt/${opts.paymentId}`);
  const rowBorder = `border-top:1px solid ${MAIL.line};`;
  const cell = "padding:10px 14px;font-size:13px;";

  const headlineHtml = `
    <p style="margin:0 0 8px;color:${MAIL.muted};font-size:14px;">${
      opts.copyOf ? `Your copy of the receipt sent to ${escapeHtml(opts.copyOf.name)} (${escapeHtml(opts.copyOf.email)}).` : "Thank you. Your payment is confirmed."
    }</p>
    <p style="margin:0;color:${MAIL.ink};font-size:38px;font-weight:700;line-height:1.1;">${receipt.amountLabel}</p>
    <p style="margin:8px 0 22px;color:${MAIL.ink};font-size:16px;font-weight:600;">Paid ${escapeHtml(receipt.paidOn)}</p>
  `;

  // The item and its total, the way a till receipt reads.
  const itemHtml = `
    <table role="presentation" width="100%" style="margin:0 0 18px;border-collapse:collapse;">
      <tr>
        <td style="padding:0 0 10px;font-size:14px;color:${MAIL.ink};">${escapeHtml(receipt.item)}</td>
        <td style="padding:0 0 10px;font-size:14px;color:${MAIL.ink};text-align:right;white-space:nowrap;">${receipt.amountLabel}</td>
      </tr>
      <tr>
        <td style="padding:10px 0 0;font-size:14px;font-weight:700;color:${MAIL.ink};${rowBorder}">Total paid</td>
        <td style="padding:10px 0 0;font-size:14px;font-weight:700;color:${MAIL.ink};text-align:right;white-space:nowrap;${rowBorder}">${receipt.amountLabel}</td>
      </tr>
    </table>
  `;

  const detailsHtml = `
    <table role="presentation" width="100%" style="margin:0 0 22px;border-collapse:separate;background:${MAIL.panel};border:1px solid ${MAIL.line};border-radius:10px;">
      ${receipt.rows
        .map(
          (row, i) => `<tr>
        <td style="${cell}color:${MAIL.muted};${i ? rowBorder : ""}">${escapeHtml(row.label)}</td>
        <td style="${cell}color:${MAIL.ink};text-align:right;${i ? rowBorder : ""}">${escapeHtml(row.value)}</td>
      </tr>`,
        )
        .join("")}
    </table>
  `;

  const noteHtml = opts.note ? `<p style="margin:0 0 22px;">${escapeHtml(opts.note)}</p>` : "";
  const buttonHtml = `<a href="${receiptUrl}" style="display:inline-block;padding:13px 22px;border-radius:10px;background:${MAIL.card};border:1px solid ${MAIL.line};color:${MAIL.ink};font-size:15px;font-weight:600;text-decoration:none;">View or print receipt</a>`;

  const html = emailShell(opts.copyOf ? "Receipt copy" : receipt.title, `${headlineHtml}${itemHtml}${detailsHtml}${opts.copyOf ? "" : noteHtml}${buttonHtml}`, {
    footerNote: opts.copyOf
      ? "You're getting this because receipt copies are on in Admin > People > Staff. Switch them off there."
      : "You're getting this because you made a payment to Bass Note Piano. Keep it for your records.",
    preheader: `${receipt.amountLabel} paid ${receipt.paidOn}. Receipt ${receipt.number}.`,
  });
  const text = [
    `Receipt ${receipt.number}`,
    opts.copyOf ? `Your copy of the receipt sent to ${opts.copyOf.name} (${opts.copyOf.email}).` : `Thank you. Your payment is confirmed.`,
    "",
    `${receipt.item}: ${receipt.amountLabel}`,
    `Total paid: ${receipt.amountLabel}`,
    "",
    ...receipt.rows.map((r) => `${r.label}: ${r.value}`),
    ...(opts.note && !opts.copyOf ? ["", opts.note] : []),
    "",
    `View or print: ${receiptUrl}`,
  ].join("\n");

  const subject = opts.copyOf
    ? `Copy: receipt ${receipt.number}, ${receipt.amountLabel} from ${opts.copyOf.name}`
    : `Receipt ${receipt.number}: ${receipt.amountLabel} paid`;
  return { subject, html, text };
}

export async function sendPaymentReceiptEmail(
  to: string,
  receipt: Receipt,
  opts: { paymentId: string; note?: string; copyOf?: { name: string; email: string } },
): Promise<void> {
  await sendEmail({ to, ...renderPaymentReceiptEmail(receipt, opts) });
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

  const listStyle = `margin:0 0 22px;padding-left:20px;color:${MAIL.body};line-height:1.7;`;
  const bodyHtml = `
    <p style="margin:0 0 16px;">Your email is verified and your account is ready. We're so glad you're here.</p>
    <p style="margin:0 0 8px;font-weight:700;color:${MAIL.ink};">What you get</p>
    <ul style="${listStyle}">${things.map((t) => `<li>${escapeHtml(t)}</li>`).join("")}</ul>
    <p style="margin:0 0 8px;font-weight:700;color:${MAIL.ink};">A few good next steps</p>
    <ol style="${listStyle}">${steps
      .map((st) => `<li style="margin:0 0 8px;">${bodyLink(st.url, escapeHtml(st.label))}<br /><span style="color:${MAIL.muted};">${escapeHtml(st.detail)}</span></li>`)
      .join("")}</ol>
    <p style="margin:0 0 20px;">Take it one scale at a time. There's no rush, and we're here whenever you need us.</p>
    ${ctaButtonHtml({ label: "Open Bass Note Piano", url: getAppUrl("/dashboard") })}
  `;
  const html = emailShell(greeting, bodyHtml, { preheader: "Your account is ready. Here is where to start." });
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

/** The owner's morning list: a short summary panel, then one tappable row per thing, each straight to the page that handles it. */
export async function sendTodoListEmail(to: string, title: string, intro: string | null, items: TodoEmailItem[]) {
  const rows = items
    .map(
      (item, i) =>
        `<tr><td style="padding:13px 16px;${i > 0 ? `border-top:1px solid ${MAIL.line};` : ""}"><a href="${item.url}" style="display:block;color:${MAIL.ink};font-size:14px;line-height:1.5;text-decoration:none;"><span style="color:${SHELL_ACCENT.default.bar};font-weight:700;">&#8250;</span>&nbsp;&nbsp;${escapeHtml(item.text)}</a></td></tr>`,
    )
    .join("");
  const summary = intro
    ? `<div style="margin:0 0 20px;padding:14px 16px;border-radius:10px;background:${MAIL.panel};border:1px solid ${MAIL.line};font-size:14px;line-height:1.6;color:${MAIL.body};">${escapeHtml(intro)}</div>`
    : "";
  const list = items.length
    ? `<p style="margin:0 0 8px;font-size:12px;letter-spacing:1.5px;text-transform:uppercase;font-weight:700;color:${MAIL.muted};">${items.length === 1 ? "1 thing needs you" : `${items.length} things need you`}</p>
       <table role="presentation" width="100%" style="margin:0 0 24px;border-collapse:separate;border:1px solid ${MAIL.line};border-radius:10px;">${rows}</table>`
    : "";
  const html = emailShell(title, `${summary}${list}${ctaButtonHtml({ label: "Open admin", url: getAppUrl("/admin") })}`, {
    preheader: items.length ? `${items.length} ${items.length === 1 ? "thing needs" : "things need"} you today.` : (intro ?? undefined),
  });
  const text = [intro, ...items.map((i) => `- ${i.text}: ${i.url}`), "", `Open admin: ${getAppUrl("/admin")}`].filter((l): l is string => l !== null).join("\n");
  await sendEmail({ to, subject: title, html, text });
}

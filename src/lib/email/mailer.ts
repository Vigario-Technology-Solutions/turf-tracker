import nodemailer from "nodemailer";
import { render } from "@react-email/components";
import * as Sentry from "@sentry/nextjs";
import { APP_NAME } from "@/lib/runtime-config";
import { PasswordResetEmail } from "@/emails/password-reset";

/**
 * SMTP-backed mailer. Transport-agnostic by design — operators wire
 * any SMTP-speaking service (SES via its SMTP endpoint, Postmark,
 * SendGrid, Mailgun, Resend, local Postfix relay) by setting the
 * SMTP_* env vars. The app never speaks AWS / vendor APIs directly.
 *
 * Auth is optional: `SMTP_USER` + `SMTP_PASS` set → nodemailer
 * presents them via AUTH PLAIN/LOGIN; both empty → unauthenticated
 * connection (the typical "localhost Postfix relay-from-host" model
 * vis runs in prod). Mixing one but not the other is treated as
 * "no auth" since nodemailer would otherwise reject the partial
 * credential.
 *
 * `SMTP_FROM_NAME` defaults to `APP_NAME` so undecorated installs
 * send "Turf Tracker <addr>" rather than a bare address. Operators
 * with a deliberate sender label that differs from the in-app brand
 * (e.g., shorter form for inbox-scan) set `SMTP_FROM_NAME`
 * explicitly.
 */
const smtpConfig = {
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : undefined,
  user: process.env.SMTP_USER,
  pass: process.env.SMTP_PASS,
  from: process.env.SMTP_FROM
    ? `"${process.env.SMTP_FROM_NAME ?? APP_NAME}" <${process.env.SMTP_FROM}>`
    : undefined,
  replyTo: process.env.SMTP_REPLY_TO,
};

const SMTP_CONFIGURED = Boolean(smtpConfig.host && smtpConfig.from);
const SMTP_AUTHED = Boolean(smtpConfig.user && smtpConfig.pass);

/**
 * Log SMTP status at server start. Called from instrumentation.ts.
 * Operators reading the journal see whether outbound email is on at
 * boot — "no email path configured" is a recoverable state (only
 * the password-reset / invite flows degrade), but it's worth the
 * one-line surface so it doesn't go unnoticed.
 */
export function logSmtpStatus(): void {
  if (!SMTP_CONFIGURED) {
    console.log("[Mailer] SMTP not configured — outbound emails log to console only.");
    return;
  }
  const auth = SMTP_AUTHED ? "AUTHED" : "no-auth";
  console.log(`[Mailer] SMTP configured: ${smtpConfig.host}:${smtpConfig.port ?? 25} (${auth})`);
}

const transporter = SMTP_CONFIGURED
  ? nodemailer.createTransport({
      host: smtpConfig.host,
      port: smtpConfig.port,
      // `secure: false` + STARTTLS on the standard submission port
      // (587) is what every modern SMTP relay (SES, Postmark,
      // SendGrid, Mailgun) accepts. `secure: true` only fits the
      // legacy 465 implicit-TLS endpoints, which the major
      // providers still offer but no longer recommend.
      secure: false,
      ...(SMTP_AUTHED && { auth: { user: smtpConfig.user, pass: smtpConfig.pass } }),
    })
  : null;

interface SendOptions {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

async function sendEmail(options: SendOptions): Promise<void> {
  // Dev fallback: when SMTP isn't configured, log the email to the
  // console with the plain-text body so flows that embed a one-time
  // link (password reset, future invites) let the operator copy the
  // URL out of the journal without standing up a real transport.
  if (!transporter) {
    console.log(`[Mailer] (no SMTP) would send to ${options.to}:`);
    console.log(`  Subject: ${options.subject}`);
    console.log(`  Body:`);
    console.log(
      options.text
        .split("\n")
        .map((line) => `    ${line}`)
        .join("\n"),
    );
    return;
  }

  // Wrap the SMTP send so transient failures (DNS hiccup, expired
  // creds, server timeout) surface in Sentry with template + recipient
  // context. Without this, callers like sendPasswordResetEmail
  // re-throw a generic message and the operator never knows their
  // reset didn't reach the user.
  try {
    const info = await transporter.sendMail({
      from: smtpConfig.from,
      replyTo: smtpConfig.replyTo,
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html,
    });
    console.log(`[Mailer] Sent email to ${options.to}: ${info.messageId}`);
  } catch (err) {
    Sentry.captureException(err, {
      tags: { area: "email", subject: options.subject },
      // Recipient on extras (not tags) — high-cardinality vs the
      // dashboard's grouping behavior. Subject on tags so dashboard
      // groups by template family (e.g. "Reset your Turf Tracker
      // password") rather than per-recipient noise.
      extra: { recipient: options.to },
    });
    throw err;
  }
}

/**
 * Send a self-serve password reset email. Caller (the request route)
 * owns token generation + storage; this function only renders and
 * dispatches. Throws on render or transport failure so the caller can
 * surface a 500 and avoid silent-drop.
 */
export async function sendPasswordResetEmail(args: {
  to: string;
  greetingName: string;
  resetUrl: string;
}): Promise<void> {
  const html = await render(
    PasswordResetEmail({
      greetingName: args.greetingName,
      resetUrl: args.resetUrl,
    }),
  );

  const text = [
    `Hi ${args.greetingName},`,
    "",
    `Someone requested a password reset for your ${APP_NAME} account. If that was you, click the link below to set a new password. If it wasn't, you can ignore this email — nothing will change.`,
    "",
    `Reset your password: ${args.resetUrl}`,
    "",
    "This link expires in 1 hour. Any devices currently signed in under your account will be signed out as soon as the new password is set.",
  ].join("\n");

  await sendEmail({
    to: args.to,
    subject: `Reset your ${APP_NAME} password`,
    text,
    html,
  });
}

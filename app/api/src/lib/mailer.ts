// SMTP reminder mail via nodemailer. SMTP is optional: when SMTP_HOST is
// blank the scheduler logs once and skips reminders instead of crashing.
import nodemailer, { type Transporter } from "nodemailer";

export function isSmtpConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST);
}

let transport: Transporter | null = null;

function getTransport(): Transporter {
  if (!transport) {
    transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_SECURE === "true",
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
        : undefined,
    });
  }
  return transport;
}

// Throws on transport failure — callers decide how to surface it.
export async function sendMail(opts: { to: string; subject: string; text: string }) {
  if (!isSmtpConfigured()) throw new Error("SMTP is not configured (SMTP_HOST is empty)");
  await getTransport().sendMail({
    from: process.env.SMTP_FROM ?? process.env.SMTP_USER,
    to: opts.to,
    subject: opts.subject,
    text: opts.text,
  });
}

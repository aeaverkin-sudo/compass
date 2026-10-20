import { Resend } from "resend";
import { eventSignInMail } from "@/shared/mail/welcome-mail";

export function mailConfigured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

async function send(to: string, subject: string, text: string) {
  if (!mailConfigured()) {
    throw new Error("mail_not_configured");
  }
  const resend = new Resend(process.env.RESEND_API_KEY);
  const { error } = await resend.emails.send({
    from: process.env.EMAIL_FROM!,
    to,
    subject,
    text,
  });
  if (error) throw new Error(error.message);
}

export type HtmlMail = {
  to: string;
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
};

export type BatchOutcome = { ok: true; id: string } | { ok: false; error: string };

export const BATCH_MAX = 100;

function payload(mail: HtmlMail) {
  return {
    from: process.env.EMAIL_FROM!,
    to: mail.to,
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
    ...(mail.headers ? { headers: mail.headers } : {}),
  };
}

/** One laid-out mail. Returns the Resend id. */
export async function sendHtmlMail(mail: HtmlMail): Promise<string | null> {
  if (!mailConfigured()) throw new Error("mail_not_configured");
  const resend = new Resend(process.env.RESEND_API_KEY);
  const { data, error } = await resend.emails.send(payload(mail));
  if (error) throw new Error(error.message);
  return data?.id ?? null;
}

/** Up to 100 mails in one call. One bad address fails alone, the rest go. */
export async function sendHtmlBatch(mails: HtmlMail[], idempotencyKey?: string): Promise<BatchOutcome[]> {
  if (!mailConfigured()) throw new Error("mail_not_configured");
  if (mails.length === 0) return [];
  if (mails.length > BATCH_MAX) throw new Error("batch_too_large");
  const resend = new Resend(process.env.RESEND_API_KEY);
  const { data, error } = await resend.batch.send(mails.map(payload), {
    batchValidation: "permissive",
    ...(idempotencyKey ? { idempotencyKey } : {}),
  });
  if (error || !data) {
    const message = error?.message ?? "Resend refused the batch.";
    return mails.map(() => ({ ok: false, error: message }));
  }
  const failed = new Map((data.errors ?? []).map((item) => [item.index, item.message]));
  const ids = [...data.data];
  return mails.map((_, index) => {
    const reason = failed.get(index);
    if (reason) return { ok: false, error: reason };
    const id = ids.shift()?.id;
    return id ? { ok: true, id } : { ok: false, error: "No id from Resend." };
  });
}

export async function sendStarterCode(to: string, code: string) {
  await send(
    to,
    "Your passcode",
    `Your passcode is ${code}.\n\nIt is your password until you change it. Keep it safe.\n\nCheers,\nADED team`,
  );
}

/** Proves a new address. The code is not a password. */
export async function sendChangeCode(to: string, code: string) {
  await send(
    to,
    "Confirm your email",
    `Your code is ${code}.\n\nEnter it to confirm this address. Your password does not change.\n\nCheers,\nADED team`,
  );
}

/** The open link, the same email on another device. The link signs in once. */
export async function sendPassLink(to: string, eventName: string, link: string) {
  await send(to, `Your pass for ${eventName}`, `Open this link to get your pass: ${link}`);
}

/** Add to My Network without a password. The link signs in once and saves the card. */
export async function sendSaveLink(to: string, cardName: string, link: string) {
  await send(
    to,
    `Add ${cardName} to your network`,
    `Open this link to add ${cardName} to your network:\n${link}\n\nNo password needed. If you didn't ask for this, ignore this message.\n\nCheers,\nADED team`,
  );
}

/** Create on the open link with an email that already has an account. The link signs in once and joins. */
export async function sendEventSignIn(to: string, eventName: string, link: string, origin: string) {
  const site = origin.replace(/\/$/, "");
  const mail = eventSignInMail({
    logoSrc: `${site}/brand/aded-grid-mail.png`,
    eventName,
    link,
    siteLabel: site.replace(/^https?:\/\//, ""),
  });
  await sendHtmlMail({ to, subject: mail.subject, html: mail.html, text: mail.text });
}

export async function sendPasswordReset(to: string, link: string) {
  await send(
    to,
    "Reset your password",
    `Set a new password:\n${link}\n\nIf you didn't ask for this, ignore this message.\n\nCheers,\nADED team`,
  );
}

import { Resend } from "resend";

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

export async function sendStarterCode(to: string, code: string) {
  await send(
    to,
    "Your Compass code",
    `Your Compass code is ${code}.\n\nIt is your password until you change it. Keep it.`,
  );
}

export async function sendPasswordReset(to: string, link: string) {
  await send(
    to,
    "Reset your Compass password",
    `Set a new Compass password:\n${link}\n\nIf you did not ask for this, ignore the message.`,
  );
}

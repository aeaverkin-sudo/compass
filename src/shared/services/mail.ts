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

export async function sendPasswordReset(to: string, link: string) {
  await send(
    to,
    "Reset your password",
    `Set a new password:\n${link}\n\nIf you didn't ask for this, ignore this message.\n\nCheers,\nADED team`,
  );
}

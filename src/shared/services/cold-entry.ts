import { createAdminSupabaseClient } from "@/shared/lib/supabase/admin";
import { mailConfigured, sendHtmlMail } from "@/shared/services/mail";
import { WELCOME_SUBJECT, welcomeMail } from "@/shared/mail/welcome-mail";

const WELCOME_SENT = "welcome_mail_at";

function siteOrigin(origin: string): string {
  const site = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "");
  return site && /^https?:\/\//i.test(site) ? site : origin;
}

/** Once per account, when the account is created. No card and no sign-in link. */
export async function sendWelcomeMail(
  userId: string,
  password: string,
  origin: string,
  access: "password" | "google" | "apple" = "password",
): Promise<boolean> {
  if (!mailConfigured()) return false;
  const admin = createAdminSupabaseClient();
  const user = (await admin.auth.admin.getUserById(userId)).data.user;
  const email = user?.email?.trim().toLowerCase();
  if (!user || !email || user.app_metadata?.[WELCOME_SENT]) return false;

  const providers = new Set((user.identities ?? []).map((identity) => identity.provider));
  const social = access === "password" ? "password" : providers.has("apple") ? "apple" : "google";
  const site = siteOrigin(origin);
  const mail = welcomeMail({
    logoSrc: `${site}/brand/aded-grid-mail.png`,
    password: password.trim(),
    ...(social === "google" ? { access: "google" as const } : {}),
    ...(social === "apple" ? { access: "apple" as const } : {}),
    siteLabel: site.replace(/^https?:\/\//, ""),
  });
  await sendHtmlMail({ to: email, subject: WELCOME_SUBJECT, html: mail.html, text: mail.text });
  const marked = await admin.auth.admin.updateUserById(userId, {
    app_metadata: { ...user.app_metadata, [WELCOME_SENT]: new Date().toISOString() },
  });
  if (marked.error) console.error("[mail] welcome mark", marked.error.message);
  return true;
}

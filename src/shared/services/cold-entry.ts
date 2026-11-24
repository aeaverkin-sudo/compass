import { createAdminSupabaseClient } from "@/shared/lib/supabase/admin";
import { mailConfigured, sendHtmlMail } from "@/shared/services/mail";
import { welcomeMail, type WelcomeAccess } from "@/shared/mail/welcome-mail";

const WELCOME_SENT = "welcome_mail_at";

function siteOrigin(origin: string): string {
  const site = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "");
  return site && /^https?:\/\//i.test(site) ? site : origin;
}

/**
 * Once per account. `portfolio` is true only when that account's portfolio was saved.
 * A later card, a second sign-in, or a repeated callback does not send another letter.
 * The password is not an argument and is not mailed.
 */
export async function sendWelcomeMail(
  userId: string,
  origin: string,
  access: WelcomeAccess,
  portfolio: boolean,
): Promise<boolean> {
  if (!mailConfigured()) return false;
  const admin = createAdminSupabaseClient();
  const user = (await admin.auth.admin.getUserById(userId)).data.user;
  const email = user?.email?.trim().toLowerCase();
  if (!user || !email || user.app_metadata?.[WELCOME_SENT]) return false;

  const marked = await admin.auth.admin.updateUserById(userId, {
    app_metadata: { ...user.app_metadata, [WELCOME_SENT]: new Date().toISOString() },
  });
  if (marked.error) {
    console.error("[mail] welcome mark", marked.error.message);
    return false;
  }

  const site = siteOrigin(origin);
  const mail = welcomeMail({
    logoSrc: `${site}/brand/aded-grid-mail.png`,
    access,
    portfolio,
    siteLabel: site.replace(/^https?:\/\//, ""),
  });
  try {
    await sendHtmlMail({ to: email, subject: mail.subject, html: mail.html, text: mail.text });
  } catch (error) {
    console.error("[mail] welcome", error instanceof Error ? error.message : "send failed");
    const { [WELCOME_SENT]: _sent, ...rest } = user.app_metadata ?? {};
    await admin.auth.admin.updateUserById(userId, { app_metadata: rest }).catch(() => undefined);
    return false;
  }
  return true;
}

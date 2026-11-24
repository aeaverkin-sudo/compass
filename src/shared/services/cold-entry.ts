import { createAdminSupabaseClient } from "@/shared/lib/supabase/admin";
import { welcomeMail, type WelcomeAccess } from "@/shared/mail/welcome-mail";
import {
  appMetadataPatch,
  classifyWelcomeFailure,
  deliverWelcome,
  welcomeIdempotencyKey,
  welcomeVariant,
} from "@/shared/mail/welcome-once";
import { MailPostError, mailConfigured, sendHtmlMail } from "@/shared/services/mail";

const WELCOME_SENT = "welcome_mail_at";

function siteOrigin(origin: string): string {
  const site = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "");
  return site && /^https?:\/\//i.test(site) ? site : origin;
}

/**
 * Once per account, across app instances. The mark is written only after Resend
 * has accepted the letter. A lost mark is retried with the same idempotency key.
 * The password is not an argument and is not mailed.
 */
export async function sendWelcomeMail(
  userId: string,
  origin: string,
  access: WelcomeAccess,
  portfolio: boolean,
): Promise<boolean> {
  if (!mailConfigured()) return false;
  const key = welcomeIdempotencyKey(userId);
  if (!key) return false;
  const admin = createAdminSupabaseClient();
  const existing = (await admin.auth.admin.getUserById(userId)).data.user;
  const to = existing?.email?.trim().toLowerCase() ?? "";
  if (!existing || !to) return false;
  const variant = welcomeVariant(existing.app_metadata ?? {}, portfolio);
  const site = siteOrigin(origin);
  const mail = welcomeMail({
    logoSrc: `${site}/brand/aded-grid-mail.png`,
    access,
    portfolio: variant,
    siteLabel: site.replace(/^https?:\/\//, ""),
  });
  const step = await deliverWelcome({
    now: Date.now(),
    key,
    claim: { welcome_claim_portfolio: variant ? "1" : "0" },
    read: async () => {
      const user = (await admin.auth.admin.getUserById(userId)).data.user;
      const email = user?.email?.trim().toLowerCase() ?? "";
      if (!user || !email) return null;
      return { email, metadata: { ...(user.app_metadata ?? {}) } };
    },
    write: async (recipe) => {
      const user = (await admin.auth.admin.getUserById(userId)).data.user;
      if (!user) return false;
      const current = { ...(user.app_metadata ?? {}) };
      const next = recipe(current);
      if (next[WELCOME_SENT] && current[WELCOME_SENT]) return true;
      const patch = appMetadataPatch(current, next);
      if (!patch) return true;
      const marked = await admin.auth.admin.updateUserById(userId, { app_metadata: patch });
      if (marked.error) {
        console.error("[mail] welcome mark");
        return false;
      }
      return true;
    },
    send: async (idempotencyKey) => {
      try {
        const id = await sendHtmlMail(
          { to, subject: mail.subject, html: mail.html, text: mail.text },
          idempotencyKey,
        );
        return id ? { accepted: true, id } : { accepted: false, inFlight: false, unknown: true };
      } catch (error) {
        const code = error instanceof MailPostError ? error.code : "";
        console.error("[mail] welcome", code || "send failed");
        return classifyWelcomeFailure(code);
      }
    },
  });
  return step === "sent";
}

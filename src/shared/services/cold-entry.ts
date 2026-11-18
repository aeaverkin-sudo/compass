import { createAdminSupabaseClient } from "@/shared/lib/supabase/admin";
import { mailConfigured, sendHtmlMail } from "@/shared/services/mail";
import { publicCardPath } from "@/shared/services/public-card-url";
import { walletPassPath } from "@/shared/services/wallet-link";
import { WELCOME_SUBJECT, welcomeMail } from "@/shared/mail/welcome-mail";
import { mintWelcomeToken, saveWelcomeToken } from "@/shared/services/welcome-token";

const WELCOME_SENT = "welcome_mail_at";

function siteOrigin(origin: string): string {
  const site = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "");
  return site && /^https?:\/\//i.test(site) ? site : origin;
}

/** Once per account, to its own confirmed email: the password, the profile link and the Wallet. */
export async function sendWelcomeMail(
  userId: string,
  cardId: string,
  password: string,
  origin: string,
  access: "password" | "google" = "password",
): Promise<boolean> {
  if (!mailConfigured()) return false;
  const admin = createAdminSupabaseClient();
  const user = (await admin.auth.admin.getUserById(userId)).data.user;
  const email = user?.email?.trim().toLowerCase();
  if (!user || !email || user.app_metadata?.[WELCOME_SENT]) return false;
  const card = await admin.from("cards").select("owner_id, handle, public_token").eq("id", cardId).maybeSingle();
  if (card.error) throw new Error(card.error.message);
  const row = card.data as { owner_id: string; handle: string | null; public_token: string | null } | null;
  if (!row || row.owner_id !== userId) return false;

  const providers = new Set((user.identities ?? []).map((identity) => identity.provider));
  const social = access === "google" && !providers.has("google") && providers.has("apple") ? "apple" : access;
  const site = siteOrigin(origin);
  const walletUrl = `${site}${walletPassPath(cardId)}`;
  const token = mintWelcomeToken();
  const mail = welcomeMail({
    logoSrc: `${site}/brand/aded-grid-mail.png`,
    password: password.trim(),
    ...(social === "google" ? { access: "google" as const } : {}),
    ...(social === "apple" ? { access: "apple" as const } : {}),
    profileUrl: `${site}${publicCardPath({ publicToken: row.public_token ?? "", handle: row.handle ?? undefined })}`,
    accessUrl: `${site}/open?t=${encodeURIComponent(token)}`,
    walletSectionUrl: walletUrl,
    walletPassUrl: walletUrl,
    siteLabel: site.replace(/^https?:\/\//, ""),
  });
  await saveWelcomeToken(userId, token);
  await sendHtmlMail({ to: email, subject: WELCOME_SUBJECT, html: mail.html, text: mail.text });
  const marked = await admin.auth.admin.updateUserById(userId, {
    app_metadata: { ...user.app_metadata, [WELCOME_SENT]: new Date().toISOString() },
  });
  if (marked.error) console.error("[mail] welcome mark", marked.error.message);
  return true;
}

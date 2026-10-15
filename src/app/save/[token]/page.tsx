import { notFound, redirect } from "next/navigation";
import { BackButton } from "@/shared/components/back-button";
import { createAdminSupabaseClient } from "@/shared/lib/supabase/admin";
import { createServerSupabaseClient } from "@/shared/lib/supabase/server";
import { saveConnection } from "@/shared/services/save-connection";
import { SAVE_SIGNUP } from "@/shared/services/save-link";
import { clearTrialClock } from "@/shared/services/trial";

export const dynamic = "force-dynamic";

const TOKEN_RE = /^[A-Za-z0-9_-]{16,64}$/;

type PageProps = { params: Promise<{ token: string }> };

function ownCard(token: string) {
  return (
    <main className="compass-main flex min-h-lvh flex-col items-center justify-center bg-white px-8">
      <BackButton fallbackHref={`/c/${token}`} />
      <p className="text-center t-body text-[var(--ink)]">This is your card</p>
    </main>
  );
}

/**
 * Saves someone else's public card into the book of whoever holds a session, then opens Network.
 * A trial or event pass account saves too, anonymous included. No session gets an email link, not a password wall.
 */
export default async function SaveCardPage({ params }: PageProps) {
  const { token } = await params;
  if (!TOKEN_RE.test(token)) notFound();

  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) {
    redirect(`/c/${encodeURIComponent(token)}/add`);
  }

  const admin = createAdminSupabaseClient();
  if (user.app_metadata?.[SAVE_SIGNUP] && user.email_confirmed_at) {
    await clearTrialClock(user.id);
    await admin.auth.admin.updateUserById(user.id, { app_metadata: { ...user.app_metadata, [SAVE_SIGNUP]: null } });
  }
  const card = await admin
    .from("cards")
    .select("id, owner_id, display_name")
    .eq("public_token", token)
    .maybeSingle();
  if (card.error) throw new Error(card.error.message);
  if (!card.data) notFound();
  if (card.data.owner_id === user.id) return ownCard(token);

  const saved = await saveConnection({ ownerId: user.id, cardId: card.data.id });
  if (!saved.ok) {
    if (saved.own) return ownCard(token);
    throw new Error(saved.message);
  }

  const name = card.data.display_name.trim() || "Untitled";
  redirect(`/network?added=${encodeURIComponent(name)}&from=${encodeURIComponent(token)}`);
}

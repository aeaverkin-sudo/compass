import { notFound, redirect } from "next/navigation";
import { BackButton } from "@/shared/components/back-button";
import { createAdminSupabaseClient } from "@/shared/lib/supabase/admin";
import { createServerSupabaseClient } from "@/shared/lib/supabase/server";

export const dynamic = "force-dynamic";

const TOKEN_RE = /^[A-Za-z0-9_-]{16,64}$/;

type PageProps = { params: Promise<{ token: string }> };

function ownCard(token: string) {
  return (
    <main className="compass-main flex min-h-lvh flex-col items-center justify-center bg-white px-8">
      <BackButton fallbackHref={`/c/${token}`} />
      <p className="text-center text-[18px] font-light text-[#111]">This is your card</p>
    </main>
  );
}

/**
 * Saves someone else's public card into the signed-in book, then opens Network.
 * A visitor without an account is sent through the existing sign-in and brought back.
 */
export default async function SaveCardPage({ params }: PageProps) {
  const { token } = await params;
  if (!TOKEN_RE.test(token)) notFound();

  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user || user.is_anonymous) {
    redirect(`/register?signin=1&next=${encodeURIComponent(`/save/${token}`)}`);
  }

  const admin = createAdminSupabaseClient();
  const card = await admin
    .from("cards")
    .select("id, owner_id, display_name")
    .eq("public_token", token)
    .maybeSingle();
  if (card.error) throw new Error(card.error.message);
  if (!card.data) notFound();
  if (card.data.owner_id === user.id) return ownCard(token);

  const saved = await admin.from("connections").upsert(
    { owner_id: user.id, saved_card_id: card.data.id, state: "active" },
    { onConflict: "owner_id,saved_card_id", ignoreDuplicates: true },
  );
  if (saved.error) {
    if (/cannot_save_own_card/i.test(saved.error.message)) return ownCard(token);
    throw new Error(saved.error.message);
  }

  const name = card.data.display_name.trim() || "Untitled";
  redirect(`/network?added=${encodeURIComponent(name)}`);
}

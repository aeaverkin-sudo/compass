import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicCardClient } from "@main/components/public-card-client";
import { loadPublicCard } from "@/shared/services/public-card";
import { loadDeletedCard } from "@/shared/services/connection-snapshot";
import { createServerSupabaseClient } from "@/shared/lib/supabase/server";
import { PendingShare } from "./pending-share";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ token: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { token } = await params;
  const loaded = await loadPublicCard(token);
  const name = loaded?.card.displayName?.trim();
  return { title: name ? `${name} — ADED` : "ADED" };
}

/** A saved contact, opened from Network. The public /c/ link is unchanged. A deleted profile opens as the book kept it. */
export default async function NetworkCardPage({ params }: PageProps) {
  const { token } = await params;
  const loaded = await loadPublicCard(token);
  if (!loaded) {
    const supabase = await createServerSupabaseClient();
    const { data } = await supabase.auth.getUser();
    const kept = data.user ? await loadDeletedCard(data.user.id, token) : null;
    if (!kept) notFound();
    return (
      <main className="compass-main min-h-lvh bg-white">
        <PublicCardClient inside deleted card={kept.card} items={kept.items} publicToken={token} />
      </main>
    );
  }

  const pending = await pendingShare(token, loaded.card.displayName ?? "");

  return (
    <main className="compass-main min-h-lvh bg-white">
      {pending ? <PendingShare id={pending.id} name={pending.name} /> : null}
      <PublicCardClient inside card={loaded.card} items={loaded.items} publicToken={loaded.card.publicToken} />
    </main>
  );
}

async function pendingShare(token: string, fallbackName: string) {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  const row = await supabase
    .from("connections")
    .select("id, state, display_name")
    .eq("owner_id", data.user.id)
    .eq("saved_card_token", token)
    .maybeSingle();
  if (row.error || !row.data || row.data.state !== "pending") return null;
  const stored = typeof row.data.display_name === "string" ? row.data.display_name.trim() : "";
  return { id: String(row.data.id), name: stored || fallbackName };
}

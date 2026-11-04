import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicCardClient } from "@main/components/public-card-client";
import { loadPublicCard } from "@/shared/services/public-card";
import { loadDeletedCard } from "@/shared/services/connection-snapshot";
import { createServerSupabaseClient } from "@/shared/lib/supabase/server";
import { ContactActions } from "./contact-actions";
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
      <main className="compass-main fixed inset-x-0 top-0 flex h-svh flex-col overflow-hidden bg-white">
        <div className="min-h-0 flex-1">
          <PublicCardClient inside deleted card={kept.card} items={kept.items} publicToken={token} />
        </div>
      </main>
    );
  }

  const link = await ownConnection(token);
  const pending = link?.state === "pending";

  return (
    <main className="compass-main fixed inset-x-0 top-0 flex h-svh flex-col overflow-hidden bg-white">
      <div className="min-h-0 flex-1">
        <PublicCardClient inside card={loaded.card} items={loaded.items} publicToken={loaded.card.publicToken} />
      </div>
      {link && pending ? <PendingShare id={link.id} /> : null}
      {link && !pending ? <ContactActions id={link.id} token={loaded.card.publicToken} /> : null}
    </main>
  );
}

async function ownConnection(token: string) {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  const row = await supabase
    .from("connections")
    .select("id, state")
    .eq("owner_id", data.user.id)
    .eq("saved_card_token", token)
    .maybeSingle();
  if (row.error || !row.data) return null;
  return { id: String(row.data.id), state: row.data.state === "pending" ? "pending" : "active" };
}


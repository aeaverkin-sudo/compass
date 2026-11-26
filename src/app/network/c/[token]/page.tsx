import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicCardClient } from "@main/components/public-card-client";
import { loadPublicCard } from "@/shared/services/public-card";
import { loadDeletedCard } from "@/shared/services/connection-snapshot";
import { createAdminSupabaseClient } from "@/shared/lib/supabase/admin";
import { sessionUser } from "@/shared/lib/supabase/session-user";
import { ContactActions } from "./contact-actions";
import { PendingShare } from "./pending-share";
import { reverseShareFor } from "@/shared/services/reverse-share";
import { notesForConnection } from "@/shared/services/note-receipts";

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
    const user = await sessionUser();
    const kept = user ? await loadDeletedCard(user.id, token) : null;
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
  const reverse = link ? await reverseShareFor(link.userId, loaded.ownerId) : "none";
  const boundNotes = link ? await notesForConnection(link.userId, link.id).catch(() => []) : [];

  return (
    <main className="compass-main fixed inset-x-0 top-0 flex h-svh flex-col overflow-hidden bg-white">
      <div className="min-h-0 flex-1">
        <PublicCardClient
          inside
          card={loaded.card}
          items={loaded.items}
          publicToken={loaded.card.publicToken}
          initialNotes={boundNotes}
        />
      </div>
      {link && pending ? <PendingShare id={link.id} /> : null}
      {link && !pending ? (
        <ContactActions
          id={link.id}
          token={loaded.card.publicToken}
          theyHaveMe={reverse === "active"}
          shareBackPending={reverse === "pending"}
          shareBackAt={link.shareBackAt}
        />
      ) : null}
    </main>
  );
}

async function ownConnection(token: string) {
  const user = await sessionUser();
  if (!user) return null;
  const admin = createAdminSupabaseClient();
  const withMark = await admin
    .from("connections")
    .select("id, state, share_back_at")
    .eq("owner_id", user.id)
    .eq("saved_card_token", token)
    .maybeSingle();
  const row =
    withMark.error && /share_back_at/i.test(withMark.error.message)
      ? await admin.from("connections").select("id, state").eq("owner_id", user.id).eq("saved_card_token", token).maybeSingle()
      : withMark;
  if (row.error || !row.data) return null;
  const shareBackAt = "share_back_at" in row.data && typeof row.data.share_back_at === "string" ? row.data.share_back_at : null;
  return {
    id: String(row.data.id),
    userId: user.id,
    state: row.data.state === "pending" ? "pending" : "active",
    shareBackAt,
  };
}


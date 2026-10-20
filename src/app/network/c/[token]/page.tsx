import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicCardClient } from "@main/components/public-card-client";
import { loadPublicCard } from "@/shared/services/public-card";
import { loadDeletedCard } from "@/shared/services/connection-snapshot";
import { createServerSupabaseClient } from "@/shared/lib/supabase/server";
import { RemoveContact } from "./remove-contact";

/** The card grows with its rows. The page scrolls when they pass the screen, down to the delete button. */
const FRAME =
  "compass-main h-dvh overflow-y-auto overscroll-y-contain bg-white [&_article]:!h-auto [&_article]:!overflow-visible [&_.compass-card-scroll]:!overflow-visible [&_.compass-card-scroll]:!overscroll-auto";

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
      <main className={FRAME}>
        <PublicCardClient inside deleted card={kept.card} items={kept.items} publicToken={token} />
        <RemoveContact token={token} />
      </main>
    );
  }

  return (
    <main className={FRAME}>
      <PublicCardClient inside card={loaded.card} items={loaded.items} publicToken={loaded.card.publicToken} />
      <RemoveContact token={token} />
    </main>
  );
}

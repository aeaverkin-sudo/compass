import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicCardClient } from "@main/components/public-card-client";
import { loadPublicCard, logPublicCardOpen } from "@/shared/services/public-card";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ publicToken: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { publicToken } = await params;
  const loaded = await loadPublicCard(publicToken);
  if (!loaded) return { title: "Compass" };
  return { title: loaded.card.displayName };
}

export default async function PublicCardPage({ params }: PageProps) {
  const { publicToken } = await params;
  const loaded = await loadPublicCard(publicToken);
  if (!loaded) notFound();

  await logPublicCardOpen(loaded.card.id, loaded.ownerId);

  return (
    <main className="compass-main min-h-lvh bg-white">
      <PublicCardClient
        card={loaded.card}
        items={loaded.items}
        publicToken={publicToken}
      />
    </main>
  );
}

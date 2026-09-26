import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BusinessCard } from "@main/components/business-card";
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
      <BusinessCard
        card={loaded.card}
        library={loaded.items}
        mode="browse"
        readOnly
      />
    </main>
  );
}

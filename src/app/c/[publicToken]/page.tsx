import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicCardClient } from "@main/components/public-card-client";
import { ViewerMirror } from "@/shared/components/viewer-mirror";
import { cardOpenKind, loadPublicCard, logPublicCardOpen, publicViewer } from "@/shared/services/public-card";
import { metadataForPublicCard } from "@/shared/services/public-card-meta";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ publicToken: string }>;
  searchParams: Promise<{ src?: string | string[]; via?: string | string[] }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { publicToken } = await params;
  const loaded = await loadPublicCard(publicToken);
  const handle = loaded?.card.handle?.trim();
  return metadataForPublicCard(loaded, handle ? `/@${handle}` : `/c/${publicToken}`);
}

export default async function PublicCardPage({ params, searchParams }: PageProps) {
  const { publicToken } = await params;
  const loaded = await loadPublicCard(publicToken);
  if (!loaded) notFound();

  const query = await searchParams;
  await logPublicCardOpen(
    loaded.card.id,
    loaded.ownerId,
    cardOpenKind(query.src ?? query.via),
    await publicViewer(),
  );

  return (
    <main className="compass-main min-h-lvh bg-white">
      <ViewerMirror />
      <PublicCardClient
        card={loaded.card}
        items={loaded.items}
        publicToken={publicToken}
      />
    </main>
  );
}

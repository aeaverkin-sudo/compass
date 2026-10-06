import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicCardClient } from "@main/components/public-card-client";
import { ViewerMirror } from "@/shared/components/viewer-mirror";
import { cardOpenKind, loadPublicCardByHandle, logPublicCardOpen, publicViewer } from "@/shared/services/public-card";
import { metadataForPublicCard } from "@/shared/services/public-card-meta";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ handle: string }>;
  searchParams: Promise<{ src?: string | string[]; via?: string | string[] }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { handle } = await params;
  const key = decodeURIComponent(handle).trim().toLowerCase();
  const loaded = await loadPublicCardByHandle(key);
  return metadataForPublicCard(loaded, `/@${key}`);
}

export default async function PublicHandlePage({ params, searchParams }: PageProps) {
  const { handle } = await params;
  const loaded = await loadPublicCardByHandle(handle);
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
      <PublicCardClient card={loaded.card} items={loaded.items} publicToken={loaded.card.publicToken} />
    </main>
  );
}

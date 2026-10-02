import type { Metadata } from "next";
import Link from "next/link";
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
  if (loaded.inactive) {
    return (
      <main className="compass-main flex min-h-lvh flex-col items-center justify-center bg-white px-8">
        <p className="text-center t-body text-[var(--ink)]">Portfolio inactive</p>
        <Link href="/register" className="mt-6 t-meta text-[var(--ink)] underline">
          Create your profile
        </Link>
      </main>
    );
  }

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

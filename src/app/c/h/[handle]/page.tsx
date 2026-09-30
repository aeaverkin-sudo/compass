import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PublicCardClient } from "@main/components/public-card-client";
import { loadPublicCardByHandle, logPublicCardOpen } from "@/shared/services/public-card";
import { metadataForPublicCard } from "@/shared/services/public-card-meta";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ handle: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { handle } = await params;
  const key = decodeURIComponent(handle).trim().toLowerCase();
  const loaded = await loadPublicCardByHandle(key);
  return metadataForPublicCard(loaded, `/@${key}`);
}

export default async function PublicHandlePage({ params }: PageProps) {
  const { handle } = await params;
  const loaded = await loadPublicCardByHandle(handle);
  if (!loaded) notFound();
  if (loaded.inactive) {
    return (
      <main className="compass-main flex min-h-lvh flex-col items-center justify-center bg-white px-8">
        <p className="text-center text-[18px] font-light text-[#111]">Portfolio inactive</p>
        <Link href="/register" className="mt-6 text-[13px] font-light text-[#111] underline">
          Create your profile
        </Link>
      </main>
    );
  }

  await logPublicCardOpen(loaded.card.id, loaded.ownerId);

  return (
    <main className="compass-main min-h-lvh bg-white">
      <PublicCardClient card={loaded.card} items={loaded.items} publicToken={loaded.card.publicToken} />
    </main>
  );
}

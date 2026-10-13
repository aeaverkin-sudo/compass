import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicCardClient } from "@main/components/public-card-client";
import { loadPublicCard, loadPublicCardByHandle } from "@/shared/services/public-card";

export const dynamic = "force-dynamic";

type PageProps = { searchParams: Promise<{ token?: string; handle?: string; back?: string }> };

/** Only an event's going list. Anything else falls back to Network. */
function backPath(raw: string | undefined): string | undefined {
  if (!raw || !/^\/e\/[^/?#]+\/going$/.test(raw)) return undefined;
  return raw;
}

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const params = await searchParams;
  const loaded = params.token
    ? await loadPublicCard(params.token)
    : params.handle
      ? await loadPublicCardByHandle(params.handle)
      : null;
  const name = loaded?.card.displayName?.trim();
  return { title: name ? `${name} — ADED` : "ADED" };
}

/** A card opened from the in-app scanner. Stays inside, with one Save. */
export default async function ScanCardPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const loaded = params.token
    ? await loadPublicCard(params.token)
    : params.handle
      ? await loadPublicCardByHandle(params.handle)
      : null;
  if (!loaded) notFound();

  return (
    <main className="compass-main min-h-lvh bg-white">
      <PublicCardClient
        inside
        save
        card={loaded.card}
        items={loaded.items}
        publicToken={loaded.card.publicToken}
        backHref={backPath(params.back)}
      />
    </main>
  );
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicCardClient } from "@main/components/public-card-client";
import { BackButton } from "@/shared/components/back-button";
import { loadPublicCard } from "@/shared/services/public-card";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ token: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { token } = await params;
  const loaded = await loadPublicCard(token);
  const name = loaded?.card.displayName?.trim();
  return { title: name ? `${name} — ADED` : "ADED" };
}

/** A saved contact, opened from Network. The public /c/ link is unchanged. */
export default async function NetworkCardPage({ params }: PageProps) {
  const { token } = await params;
  const loaded = await loadPublicCard(token);
  if (!loaded) notFound();
  if (loaded.inactive) {
    return (
      <main className="compass-main flex min-h-lvh flex-col items-center justify-center bg-white px-8">
        <BackButton fallbackHref="/network" />
        <p className="text-center t-body text-[var(--ink)]">Portfolio inactive</p>
      </main>
    );
  }

  return (
    <main className="compass-main min-h-lvh bg-white">
      <PublicCardClient inside card={loaded.card} items={loaded.items} publicToken={loaded.card.publicToken} />
    </main>
  );
}

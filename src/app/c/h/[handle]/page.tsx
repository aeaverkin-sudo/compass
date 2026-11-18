import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { PublicCardClient } from "@main/components/public-card-client";
import { ViewerMirror } from "@/shared/components/viewer-mirror";
import { isNoteCode, splitCodedHandle } from "@/shared/services/card-handle";
import {
  cardOpenKind,
  loadPublicCardByCode,
  loadPublicCardByHandle,
  logPublicCardOpen,
  publicViewer,
  type PublicCard,
} from "@/shared/services/public-card";
import { metadataForPublicCard } from "@/shared/services/public-card-meta";
import { publicCardPath, publicCardPathWithNote } from "@/shared/services/public-card-url";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ handle: string }>;
  searchParams: Promise<{ src?: string | string[]; via?: string | string[]; n?: string | string[] }>;
};

/** The current card for this address. An old coded address resolves by its code, for the preview only. */
async function cardAtHandle(handle: string): Promise<PublicCard | null> {
  const key = decodeURIComponent(handle).trim().toLowerCase();
  const exact = await loadPublicCardByHandle(key);
  if (exact) return exact;
  const coded = splitCodedHandle(key);
  if (!coded) return null;
  return loadPublicCardByCode(coded.code);
}

function first(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

function addressQuery(
  query: { src?: string | string[]; via?: string | string[]; n?: string | string[] },
  skipNote: boolean,
): string {
  const params = new URLSearchParams();
  for (const key of (skipNote ? ["src", "via"] : ["src", "via", "n"]) as readonly ("src" | "via" | "n")[]) {
    const value = query[key];
    if (typeof value === "string") params.append(key, value);
    else if (Array.isArray(value)) for (const item of value) params.append(key, item);
  }
  const text = params.toString();
  return text ? `?${text}` : "";
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { handle } = await params;
  const key = decodeURIComponent(handle).trim().toLowerCase();
  const loaded = await cardAtHandle(key);
  const path = loaded
    ? publicCardPath({ publicToken: loaded.card.publicToken, handle: loaded.card.handle })
    : publicCardPath({ publicToken: "", handle: key });
  return metadataForPublicCard(loaded, path);
}

export default async function PublicHandlePage({ params, searchParams }: PageProps) {
  const { handle } = await params;
  const key = decodeURIComponent(handle).trim().toLowerCase();
  const loaded = await loadPublicCardByHandle(key);
  if (!loaded) {
    const coded = splitCodedHandle(key);
    const found = coded ? await loadPublicCardByCode(coded.code) : null;
    // 307. A later No or New link drops the old address; a 308 would keep sending people there.
    if (found && found.card.handle !== key) {
      const query = await searchParams;
      const note = first(query.n);
      const base = publicCardPath({ publicToken: found.card.publicToken, handle: found.card.handle });
      const path = isNoteCode(note)
        ? publicCardPathWithNote({ publicToken: found.card.publicToken, handle: found.card.handle }, note)
        : base;
      redirect(path + addressQuery(query, path !== base));
    }
    notFound();
  }

  const query = await searchParams;
  await logPublicCardOpen(
    loaded.card.id,
    loaded.ownerId,
    cardOpenKind(query.src ?? query.via),
    await publicViewer(),
  );

  return (
    <main className="min-h-lvh bg-white">
      <ViewerMirror />
      <PublicCardClient
        card={loaded.card}
        items={loaded.items}
        publicToken={loaded.card.publicToken}
        noteCode={first(query.n)}
      />
    </main>
  );
}

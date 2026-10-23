import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/shared/lib/supabase/server";
import { loadPublicCard } from "@/shared/services/public-card";
import { consumePendingNotes, previewPendingNotes } from "@/shared/services/notes-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteProps = { params: Promise<{ publicToken: string }> };

function noStore(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/**
 * Real browser viewers only. SSR and messenger crawlers never call this,
 * so they cannot burn the one-time notes.
 */
export async function POST(request: Request, context: RouteProps) {
  const { publicToken } = await context.params;

  let consumeOnShare = false;
  try {
    const body = await request.json();
    if (body && typeof body === "object" && (body as { action?: unknown }).action === "consume") {
      consumeOnShare = true;
    }
  } catch {
    // Visitors post with no body.
  }

  let loaded;
  try {
    loaded = await loadPublicCard(publicToken);
  } catch {
    return noStore({ error: "Could not read the card" }, 500);
  }
  if (!loaded) return noStore({ error: "Not found" }, 404);

  let userId: string | null = null;
  try {
    const supabase = await createServerSupabaseClient();
    const { data } = await supabase.auth.getUser();
    userId = data.user?.id ?? null;
  } catch {
    userId = null;
  }

  if (userId && userId === loaded.ownerId) {
    if (!consumeOnShare) {
      try {
        const notes = await previewPendingNotes(loaded.card.id);
        return noStore({ notes, owner: true });
      } catch (error) {
        console.error("[notes] preview failed", error);
        return noStore({ error: "Could not read notes" }, 500);
      }
    }
    try {
      const notes = await consumePendingNotes(loaded.card.id, "share");
      return noStore({ notes, owner: true });
    } catch (error) {
      console.error("[notes] share consume failed", error);
      return noStore({ error: "Could not close notes" }, 500);
    }
  }

  try {
    const notes = await consumePendingNotes(loaded.card.id);
    return noStore({ notes, owner: false });
  } catch (error) {
    console.error("[notes] consume failed", error);
    return noStore({ error: "Could not open notes" }, 500);
  }
}

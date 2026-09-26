import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/shared/lib/supabase/server";
import { loadPublicCard } from "@/shared/services/public-card";
import { consumePendingNotes } from "@/shared/services/notes-server";

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
export async function POST(_request: Request, context: RouteProps) {
  const { publicToken } = await context.params;

  let loaded;
  try {
    loaded = await loadPublicCard(publicToken);
  } catch {
    return noStore({ error: "Could not read the card" }, 500);
  }
  if (!loaded) return noStore({ error: "Not found" }, 404);

  try {
    const supabase = await createServerSupabaseClient();
    const { data } = await supabase.auth.getUser();
    if (data.user?.id === loaded.ownerId) {
      return noStore({ notes: [], owner: true });
    }
  } catch {
    // No session: this is a visitor.
  }

  try {
    const notes = await consumePendingNotes(loaded.card.id);
    return noStore({ notes, owner: false });
  } catch (error) {
    console.error("[notes] consume failed", error);
    return noStore({ error: "Could not open notes" }, 500);
  }
}

import { NextResponse } from "next/server";
import { requireOwnerId } from "@/shared/services/attachment-api";
import { createAdminSupabaseClient } from "@/shared/lib/supabase/admin";
import { createServerSupabaseClient } from "@/shared/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

type ConnectionRow = {
  id: string;
  display_name: string;
  state: string;
  saved_card_id: string;
  saved_card_token: string;
  source_event_id: string | null;
  created_at: string;
};

type CardFace = {
  id: string;
  title: string | null;
  photo_attachment_id: string | null;
};

/**
 * The signed-in person's book only. RLS reads the rows.
 * Photo and role come from the saved card, which the book itself cannot see.
 */
export async function GET() {
  const owner = await requireOwnerId();
  if (!owner.ok) return noStore({ error: owner.error }, owner.status);

  try {
    const supabase = await createServerSupabaseClient();
    const loaded = await supabase
      .from("connections")
      .select("id, display_name, state, saved_card_id, saved_card_token, source_event_id, created_at")
      .eq("owner_id", owner.id)
      .order("created_at", { ascending: true });
    if (loaded.error) throw new Error(loaded.error.message);

    const rows = (loaded.data ?? []) as ConnectionRow[];
    const ids = [...new Set(rows.map((row) => row.saved_card_id))];
    const faces = new Map<string, CardFace>();
    if (ids.length > 0) {
      const admin = createAdminSupabaseClient();
      const cards = await admin.from("cards").select("id, title, photo_attachment_id").in("id", ids);
      if (cards.error) throw new Error(cards.error.message);
      for (const card of (cards.data ?? []) as CardFace[]) faces.set(card.id, card);
    }

    return noStore({
      connections: rows.map((row) => {
        const face = faces.get(row.saved_card_id);
        const role = face?.title?.trim() ?? "";
        return {
          id: row.id,
          displayName: row.display_name,
          state: row.state === "pending" ? "pending" : "active",
          savedCardToken: row.saved_card_token,
          sourceEventId: row.source_event_id,
          createdAt: row.created_at,
          role,
          photoUrl: face?.photo_attachment_id ? `/f/${face.photo_attachment_id}` : null,
        };
      }),
    });
  } catch (error) {
    console.error("[connections] list", error);
    return noStore({ error: "Could not read contacts" }, 500);
  }
}

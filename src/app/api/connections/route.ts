import { NextResponse } from "next/server";
import { requireOwnerId } from "@/shared/services/attachment-api";
import { foldSearch } from "@/shared/lib/search-fold";
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
  display_name: string | null;
  photo_attachment_id: string | null;
  searchable?: boolean | null;
};

type LinkRow = { card_id: string; item_id: string };
type ItemRow = { id: string; label: string | null; value: string | null; url: string | null };

function piece(value: string | null | undefined) {
  const text = (value ?? "").trim();
  if (!text || text.startsWith("data:")) return "";
  return text;
}

function joinSearch(...parts: Array<string | null | undefined>) {
  return foldSearch(parts.map((part) => piece(part)).filter(Boolean).join(" "));
}

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
    const lines = new Map<string, string>();
    if (ids.length > 0) {
      const admin = createAdminSupabaseClient();
      const withFlag = await admin
        .from("cards")
        .select("id, title, display_name, photo_attachment_id, searchable")
        .in("id", ids);
      const cards =
        withFlag.error && /searchable/i.test(withFlag.error.message)
          ? await admin.from("cards").select("id, title, display_name, photo_attachment_id").in("id", ids)
          : withFlag;
      if (cards.error) throw new Error(cards.error.message);
      for (const card of (cards.data ?? []) as CardFace[]) faces.set(card.id, card);

      const openIds = [
        ...new Set(
          rows
            .filter((row) => row.state !== "pending" && faces.get(row.saved_card_id)?.searchable !== false)
            .map((row) => row.saved_card_id),
        ),
      ];
      if (openIds.length > 0) {
        const links = await admin
          .from("card_items")
          .select("card_id, item_id")
          .in("card_id", openIds)
          .eq("visible", true);
        if (links.error) throw new Error(links.error.message);
        const linkRows = (links.data ?? []) as LinkRow[];
        const itemIds = [...new Set(linkRows.map((link) => link.item_id))];
        const byItem = new Map<string, ItemRow>();
        if (itemIds.length > 0) {
          const items = await admin.from("items").select("id, label, value, url").in("id", itemIds);
          if (items.error) throw new Error(items.error.message);
          for (const item of (items.data ?? []) as ItemRow[]) byItem.set(item.id, item);
        }
        const grouped = new Map<string, string[]>();
        for (const link of linkRows) {
          const item = byItem.get(link.item_id);
          if (!item) continue;
          const text = [piece(item.label), piece(item.value), piece(item.url)].filter(Boolean).join(" ");
          if (!text) continue;
          const bucket = grouped.get(link.card_id) ?? [];
          bucket.push(text);
          grouped.set(link.card_id, bucket);
        }
        for (const [cardId, parts] of grouped) lines.set(cardId, parts.join(" "));
      }
    }

    return noStore({
      connections: rows.map((row) => {
        const face = faces.get(row.saved_card_id);
        const role = face?.title?.trim() ?? "";
        const active = row.state !== "pending";
        const deep = active && face?.searchable !== false;
        return {
          id: row.id,
          displayName: row.display_name,
          state: active ? "active" : "pending",
          savedCardToken: row.saved_card_token,
          sourceEventId: row.source_event_id,
          createdAt: row.created_at,
          role,
          photoUrl: face?.photo_attachment_id ? `/f/${face.photo_attachment_id}` : null,
          searchText: joinSearch(row.display_name, role, deep ? face?.display_name : "", deep ? lines.get(row.saved_card_id) : ""),
        };
      }),
    });
  } catch (error) {
    console.error("[connections] list", error);
    return noStore({ error: "Could not read contacts" }, 500);
  }
}

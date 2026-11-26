import { NextResponse } from "next/server";
import { requireOwnerId } from "@/shared/services/attachment-api";
import { foldSearch } from "@/shared/lib/search-fold";
import { photoLookValue, type StoredPhotoLook } from "@/shared/lib/photo-look";
import { createAdminSupabaseClient } from "@/shared/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

type ConnectionRow = {
  id: string;
  display_name: string;
  saved_card_id: string;
  saved_card_token: string;
  source_event_id: string | null;
  created_at: string;
  state?: string | null;
  snapshot?: { title?: unknown } | null;
  share_back_at?: string | null;
};

type CardFace = {
  id: string;
  owner_id: string;
  title: string | null;
  display_name: string | null;
  photo_attachment_id: string | null;
  photo_look?: string | null;
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
 * The signed-in person's book only. The owner id is already known, so the
 * service role reads those rows and does not rotate the login.
 * Photo and role come from the saved card, which the book itself cannot see.
 */
export async function GET() {
  const owner = await requireOwnerId();
  if (!owner.ok) return noStore({ error: owner.error }, owner.status);

  try {
    const admin = createAdminSupabaseClient();
    const read = (columns: string) =>
      admin.from("connections").select(columns).eq("owner_id", owner.id).order("created_at", { ascending: true });
    const base = "id, display_name, saved_card_id, saved_card_token, source_event_id, created_at, state";
    const attempts = [`${base}, snapshot, share_back_at`, `${base}, snapshot`, `${base}, share_back_at`, base];
    let loaded = await read(attempts[0] ?? base);
    for (let index = 1; index < attempts.length && loaded.error && /snapshot|share_back_at/i.test(loaded.error.message); index += 1) {
      loaded = await read(attempts[index] ?? base);
    }
    if (loaded.error) throw new Error(loaded.error.message);

    const rows = (loaded.data ?? []) as unknown as ConnectionRow[];
    const ids = [...new Set(rows.flatMap((row) => (row.saved_card_id ? [row.saved_card_id] : [])))];
    const faces = new Map<string, CardFace>();
    const lines = new Map<string, string>();
    const reverse = new Map<string, "pending" | "active">();
    if (ids.length > 0) {
      const readFaces = (columns: string) => admin.from("cards").select(columns).in("id", ids);
      // Faces and the owner's cards are independent — fetch together.
      const [withLook, mine] = await Promise.all([
        readFaces("id, owner_id, title, display_name, photo_attachment_id, photo_look, searchable"),
        admin.from("cards").select("id").eq("owner_id", owner.id),
      ]);
      const withFlag =
        withLook.error && /photo_look/i.test(withLook.error.message)
          ? await readFaces("id, owner_id, title, display_name, photo_attachment_id, searchable")
          : withLook;
      const cards =
        withFlag.error && /searchable/i.test(withFlag.error.message)
          ? await readFaces("id, owner_id, title, display_name, photo_attachment_id")
          : withFlag;
      if (cards.error) throw new Error(cards.error.message);
      for (const card of (cards.data ?? []) as unknown as CardFace[]) faces.set(card.id, card);

      const mineIds = mine.error ? [] : ((mine.data ?? []) as { id: string }[]).map((card) => card.id);
      const theirOwners = [...new Set([...faces.values()].map((face) => face.owner_id).filter(Boolean))];
      const openIds = [
        ...new Set(
          rows
            .filter((row) => {
              const face = faces.get(row.saved_card_id);
              return face != null && face.searchable !== false;
            })
            .map((row) => row.saved_card_id),
        ),
      ];

      const reversePromise =
        mineIds.length > 0 && theirOwners.length > 0
          ? admin
              .from("connections")
              .select("owner_id, state")
              .in("saved_card_id", mineIds)
              .in("owner_id", theirOwners)
          : Promise.resolve({ data: [] as { owner_id: string; state: string | null }[], error: null });

      const linksPromise =
        openIds.length > 0
          ? admin.from("card_items").select("card_id, item_id").in("card_id", openIds).eq("visible", true)
          : Promise.resolve({ data: [] as LinkRow[], error: null });

      const [held, links] = await Promise.all([reversePromise, linksPromise]);
      if (held.error) throw new Error(held.error.message);
      for (const row of held.data ?? []) {
        const id = String(row.owner_id);
        const next = row.state === "pending" ? "pending" : "active";
        if (reverse.get(id) === "active") continue;
        reverse.set(id, next);
      }

      if (links.error) throw new Error(links.error.message);
      const linkRows = (links.data ?? []) as LinkRow[];
      const itemIds = [...new Set(linkRows.map((link) => link.item_id))];
      if (itemIds.length > 0) {
        const items = await admin.from("items").select("id, label, value, url").in("id", itemIds);
        if (items.error) throw new Error(items.error.message);
        const byItem = new Map<string, ItemRow>();
        for (const item of (items.data ?? []) as ItemRow[]) byItem.set(item.id, item);
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
      connections: rows.flatMap((row) => {
        const face = faces.get(row.saved_card_id);
        // The card left with the account. The book does not keep a deleted profile.
        if (!face) return [];
        const role = face.title?.trim() || "";
        const deep = face.searchable !== false;
        const held = reverse.get(face.owner_id);
        const photoUrl = face.photo_attachment_id ? `/f/${face.photo_attachment_id}` : null;
        const photoLook: StoredPhotoLook | undefined = photoLookValue(face.photo_look);
        return [{
          id: row.id,
          displayName: row.display_name,
          state: row.state === "pending" ? ("pending" as const) : ("active" as const),
          savedCardToken: row.saved_card_token,
          sourceEventId: row.source_event_id,
          createdAt: row.created_at,
          role,
          photoUrl,
          ...(photoLook ? { photoLook } : {}),
          searchText: joinSearch(row.display_name, role, deep ? face.display_name : "", deep ? lines.get(row.saved_card_id) : ""),
          theyHaveMe: held === "active",
          shareBackPending: held === "pending",
          shareBackAt: typeof row.share_back_at === "string" && row.share_back_at ? row.share_back_at : null,
        }];
      }),
    });
  } catch (error) {
    console.error("[connections] list", error);
    return noStore({ error: "Could not read contacts" }, 500);
  }
}

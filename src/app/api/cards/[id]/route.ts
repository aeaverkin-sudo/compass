import { NextResponse } from "next/server";
import { requireOwnerId } from "@/shared/services/attachment-api";
import { deleteOwnCard } from "@/shared/services/card-delete";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteProps = { params: Promise<{ id: string }> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function noStore(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(request: Request, context: RouteProps) {
  const owner = await requireOwnerId();
  if (!owner.ok) return noStore({ error: owner.error }, owner.status);

  const { id } = await context.params;
  if (!UUID.test(id)) return noStore({ error: "Portfolio not found." }, 404);

  let body: { photoAttachmentId?: string };
  try {
    body = (await request.json()) as { photoAttachmentId?: string };
  } catch {
    return noStore({ error: "Expected JSON" }, 400);
  }
  const photoAttachmentId = (body.photoAttachmentId ?? "").trim();
  if (!UUID.test(photoAttachmentId)) return noStore({ error: "Photo not found." }, 400);

  const { createAdminSupabaseClient } = await import("@/shared/lib/supabase/admin");
  const admin = createAdminSupabaseClient();
  const saved = await admin
    .from("cards")
    .update({ photo_attachment_id: photoAttachmentId, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("owner_id", owner.id);
  if (saved.error) return noStore({ error: "Could not save the photo." }, 500);
  return noStore({ ok: true });
}

export async function DELETE(_request: Request, context: RouteProps) {
  const owner = await requireOwnerId();
  if (!owner.ok) return noStore({ error: owner.error }, owner.status);

  const { id } = await context.params;
  if (!UUID.test(id)) return noStore({ error: "Portfolio not found." }, 404);

  try {
    const outcome = await deleteOwnCard(owner.id, id);
    if (outcome === "missing") return noStore({ error: "Portfolio not found." }, 404);
    if (outcome === "last") return noStore({ error: "Keep at least one portfolio." }, 400);
    return noStore({ ok: true });
  } catch (error) {
    console.error("[cards] delete", error);
    return noStore({ error: "Could not delete the portfolio." }, 500);
  }
}

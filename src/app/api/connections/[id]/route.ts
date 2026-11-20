import { NextResponse } from "next/server";
import { isUuid, requireOwnerId } from "@/shared/services/attachment-api";
import { deleteOwnedConnection } from "@/shared/services/note-receipts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteProps = { params: Promise<{ id: string }> };

function noStore(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/**
 * Deletes one connection owned by the signed-in person.
 * Notes copies and storage objects for that contact go first; safe to retry.
 */
export async function DELETE(_request: Request, context: RouteProps) {
  const owner = await requireOwnerId();
  if (!owner.ok) return noStore({ error: owner.error }, owner.status);
  const { id } = await context.params;
  if (!isUuid(id)) return noStore({ error: "Not found" }, 404);

  try {
    const removed = await deleteOwnedConnection(owner.id, id);
    if (!removed.ok) return noStore({ error: removed.error }, removed.status);
    return noStore({ ok: true });
  } catch (error) {
    console.error("[connections] delete", error);
    return noStore({ error: "Could not delete the contact" }, 500);
  }
}

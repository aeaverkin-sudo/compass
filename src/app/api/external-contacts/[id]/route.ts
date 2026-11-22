import { NextResponse } from "next/server";
import { ABOUT_EDIT_MAX } from "@/features/contact-collect/about-text";
import { parseExternalContact } from "@/features/contact-collect/lines";
import { deleteExternalContact, readExternalContact, updateExternalContact } from "@/features/contact-collect/store";
import { isUuid, requireOwnerId } from "@/shared/services/attachment-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteProps = { params: Promise<{ id: string }> };

function noStore(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function fromStore(result: { status: number; error: string; available?: false }) {
  if (result.available === false) return noStore({ error: result.error, available: false }, result.status);
  return noStore({ error: result.error }, result.status);
}

export async function GET(_request: Request, context: RouteProps) {
  const owner = await requireOwnerId();
  if (!owner.ok) return noStore({ error: owner.error }, owner.status);
  const { id } = await context.params;
  if (!isUuid(id)) return noStore({ error: "Contact not found." }, 404);

  try {
    const loaded = await readExternalContact(owner.id, id);
    if (!loaded.ok) return fromStore(loaded);
    return noStore({ contact: loaded.contact });
  } catch (error) {
    console.error("[external-contacts] read", error);
    return noStore({ error: "Could not read contacts." }, 500);
  }
}

export async function PUT(request: Request, context: RouteProps) {
  const owner = await requireOwnerId();
  if (!owner.ok) return noStore({ error: owner.error }, owner.status);
  const { id } = await context.params;
  if (!isUuid(id)) return noStore({ error: "Contact not found." }, 404);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return noStore({ error: "Expected a contact." }, 400);
  }
  const parsed = parseExternalContact(body, { noteMax: ABOUT_EDIT_MAX });
  if (!parsed.ok) return noStore({ error: parsed.error }, 400);

  try {
    const saved = await updateExternalContact(owner.id, id, parsed.value);
    if (!saved.ok) return fromStore(saved);
    return noStore({ contact: saved.contact });
  } catch (error) {
    console.error("[external-contacts] update", error);
    return noStore({ error: "Could not save the contact." }, 500);
  }
}

export async function DELETE(_request: Request, context: RouteProps) {
  const owner = await requireOwnerId();
  if (!owner.ok) return noStore({ error: owner.error }, owner.status);
  const { id } = await context.params;
  if (!isUuid(id)) return noStore({ error: "Contact not found." }, 404);

  try {
    const removed = await deleteExternalContact(owner.id, id);
    if (!removed.ok) return fromStore(removed);
    return noStore({ ok: true });
  } catch (error) {
    console.error("[external-contacts] delete", error);
    return noStore({ error: "Could not delete the contact." }, 500);
  }
}

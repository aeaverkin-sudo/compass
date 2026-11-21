import { NextResponse } from "next/server";
import { parseExternalContact } from "@/features/contact-collect/lines";
import { createExternalContact, listExternalContacts } from "@/features/contact-collect/store";
import { requireOwnerId } from "@/shared/services/attachment-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function fromStore(result: { status: number; error: string; available?: false }) {
  if (result.available === false) return noStore({ error: result.error, available: false }, result.status);
  return noStore({ error: result.error }, result.status);
}

/** The collected book. Network does not call this until the table is in use. */
export async function GET() {
  const owner = await requireOwnerId();
  if (!owner.ok) return noStore({ error: owner.error }, owner.status);
  try {
    const list = await listExternalContacts(owner.id);
    if (!list.ok) return fromStore(list);
    return noStore({ available: list.available, contacts: list.contacts });
  } catch (error) {
    console.error("[external-contacts] list", error);
    return noStore({ error: "Could not read contacts." }, 500);
  }
}

export async function POST(request: Request) {
  const owner = await requireOwnerId();
  if (!owner.ok) return noStore({ error: owner.error }, owner.status);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return noStore({ error: "Expected a contact." }, 400);
  }
  const parsed = parseExternalContact(body);
  if (!parsed.ok) return noStore({ error: parsed.error }, 400);
  if (
    parsed.value.web !== undefined ||
    parsed.value.social !== undefined ||
    parsed.value.about !== undefined ||
    parsed.value.files !== undefined
  ) {
    return noStore({ error: "Save the contact first." }, 400);
  }

  try {
    const saved = await createExternalContact(owner.id, parsed.value);
    if (!saved.ok) return fromStore(saved);
    return noStore({ contact: saved.contact }, 201);
  } catch (error) {
    console.error("[external-contacts] create", error);
    return noStore({ error: "Could not save the contact." }, 500);
  }
}

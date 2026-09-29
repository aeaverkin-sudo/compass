import { NextResponse } from "next/server";
import { requireOwnerId } from "@/shared/services/attachment-api";
import { deleteOwnAccount } from "@/shared/services/account-delete";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const owner = await requireOwnerId();
  if (!owner.ok) return NextResponse.json({ error: owner.error }, { status: owner.status });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected JSON" }, { status: 400 });
  }
  const confirm = body && typeof body === "object" ? (body as { confirm?: unknown }).confirm : null;
  if (confirm !== "DELETE") {
    return NextResponse.json({ error: "Type DELETE to confirm" }, { status: 400 });
  }

  try {
    await deleteOwnAccount(owner.id);
  } catch (error) {
    console.error("[account] delete", error);
    return NextResponse.json({ error: "Could not delete the account" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

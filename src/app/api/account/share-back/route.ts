import { NextResponse } from "next/server";
import { requireOwnerId } from "@/shared/services/attachment-api";
import { createAdminSupabaseClient } from "@/shared/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function missingColumn(message: string) {
  return /accept_share_back/i.test(message);
}

/** On by default: a shared-back card arrives pending. Off: share-back writes nothing. */
export async function GET() {
  const owner = await requireOwnerId();
  if (!owner.ok) return noStore({ error: owner.error }, owner.status);
  try {
    const admin = createAdminSupabaseClient();
    const row = await admin.from("profiles").select("accept_share_back").eq("id", owner.id).maybeSingle();
    if (row.error) {
      if (missingColumn(row.error.message)) return noStore({ accept: true });
      throw new Error(row.error.message);
    }
    return noStore({ accept: row.data?.accept_share_back !== false });
  } catch (error) {
    console.error("[account] share-back read", error);
    return noStore({ error: "Could not read." }, 500);
  }
}

export async function POST(request: Request) {
  const owner = await requireOwnerId();
  if (!owner.ok) return noStore({ error: owner.error }, owner.status);
  let accept: unknown = null;
  try {
    const body = (await request.json()) as { accept?: unknown };
    accept = body.accept;
  } catch {
    accept = null;
  }
  if (typeof accept !== "boolean") return noStore({ error: "Choose on or off." }, 400);
  try {
    const admin = createAdminSupabaseClient();
    const saved = await admin.from("profiles").update({ accept_share_back: accept }).eq("id", owner.id);
    if (saved.error) {
      if (missingColumn(saved.error.message)) return noStore({ error: "Column not applied." }, 503);
      throw new Error(saved.error.message);
    }
    return noStore({ accept });
  } catch (error) {
    console.error("[account] share-back", error);
    return noStore({ error: "Could not save." }, 500);
  }
}

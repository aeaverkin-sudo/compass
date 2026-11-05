import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/shared/lib/supabase/server";
import { saveScannedCard } from "@/shared/services/scan-save";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/** The in-app scanner. Returns new, existing, or own before the screen moves. */
export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user || user.is_anonymous) return noStore({ error: "Unauthorized" }, 401);

  let token = "";
  let handle = "";
  try {
    const body = (await request.json()) as { token?: unknown; handle?: unknown };
    token = typeof body.token === "string" ? body.token : "";
    handle = typeof body.handle === "string" ? body.handle : "";
  } catch {
    return noStore({ error: "Not an ADED card" }, 400);
  }

  try {
    const saved = await saveScannedCard(user.id, { token, handle });
    if (!saved) return noStore({ error: "Not an ADED card" }, 404);
    return noStore(saved);
  } catch (error) {
    console.error("[scan] save", error);
    return noStore({ error: "Could not save the card" }, 500);
  }
}

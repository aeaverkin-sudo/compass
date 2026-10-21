import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/shared/lib/supabase/admin";
import { createServerSupabaseClient } from "@/shared/lib/supabase/server";
import { PASSWORD_SET } from "@/shared/services/guest-accept";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/** After a password is saved: a personal event link no longer signs this account in. */
export async function POST() {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user || user.is_anonymous) return noStore({ error: "Sign in." }, 401);
  if (user.app_metadata?.[PASSWORD_SET]) return noStore({ ok: true });
  const admin = createAdminSupabaseClient();
  const { error } = await admin.auth.admin.updateUserById(user.id, {
    app_metadata: { ...user.app_metadata, [PASSWORD_SET]: new Date().toISOString() },
  });
  if (error) return noStore({ error: "Could not save." }, 500);
  return noStore({ ok: true });
}

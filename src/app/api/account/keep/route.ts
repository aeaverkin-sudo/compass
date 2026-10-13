import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/shared/lib/supabase/admin";
import { createServerSupabaseClient } from "@/shared/lib/supabase/server";
import { clearTrialClock, readAccountStatus } from "@/shared/services/trial";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/** Keep my profile. A confirmed email keeps it with this tap. A phone guest registers first. */
export async function POST() {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) return noStore({ error: "Sign in first." }, 401);
  if (user.is_anonymous || !user.email || !user.email_confirmed_at) return noStore({ next: "/register" });

  try {
    if ((await readAccountStatus(user.id)).registered) return noStore({ kept: true });
    await clearTrialClock(user.id);
    const admin = createAdminSupabaseClient();
    const marked = await admin.from("profiles").update({ event_trial: false }).eq("id", user.id);
    if (marked.error && !/event_trial/i.test(marked.error.message)) throw new Error(marked.error.message);
    const updated = await admin.auth.admin.updateUserById(user.id, { app_metadata: { ...user.app_metadata, event_trial: false } });
    if (updated.error) throw new Error(updated.error.message);
    return noStore({ kept: true });
  } catch (error) {
    console.error("[account] keep", error);
    return noStore({ error: "Could not keep the profile." }, 500);
  }
}

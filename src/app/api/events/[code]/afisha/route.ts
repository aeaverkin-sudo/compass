import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/shared/lib/supabase/admin";
import { createServerSupabaseClient } from "@/shared/lib/supabase/server";
import { loadManageEvent } from "@/shared/services/event-manage";
import { loadEventInvite } from "@/shared/services/event-invite";
import { loadPosterPath, POSTER_BUCKET } from "@/shared/services/poster-snapshot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteProps = { params: Promise<{ code: string }> };

/** The poster snapshot as a PNG to post with the link, named `{slug}-afisha.png`. */
export async function GET(_request: Request, context: RouteProps) {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user || data.user.is_anonymous) return NextResponse.json({ error: "Sign in." }, { status: 401 });
  const { code } = await context.params;
  const loaded = await loadManageEvent(code, data.user.id, "edit");
  if (loaded.kind === "missing") return NextResponse.json({ error: "Event not found" }, { status: 404 });
  if (loaded.kind !== "ok") return NextResponse.json({ error: "Not allowed." }, { status: 403 });

  const [path, invite] = await Promise.all([loadPosterPath(loaded.event.id), loadEventInvite(code)]);
  if (!path) return NextResponse.json({ error: "No poster yet." }, { status: 404 });
  const file = await createAdminSupabaseClient().storage.from(POSTER_BUCKET).download(path);
  if (file.error || !file.data) return NextResponse.json({ error: "Could not open the poster." }, { status: 500 });

  const slug = (invite?.slug?.trim() || invite?.code || "event").replace(/[^\p{L}\p{N}_-]+/gu, "-");
  const name = `${slug}-afisha.png`;
  return new NextResponse(file.data, {
    headers: {
      "Content-Type": "image/png",
      "Content-Disposition": `attachment; filename="afisha.png"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "no-store",
    },
  });
}

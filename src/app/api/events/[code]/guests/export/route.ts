import { NextResponse } from "next/server";
import { sessionUser } from "@/shared/lib/supabase/session-user";
import { loadManageEvent } from "@/shared/services/event-manage";
import { loadGuestBook } from "@/shared/services/event-guest-lists";
import { csvFileName, guestsCsv } from "@/shared/services/event-export";
import { eventTitleLine } from "@/shared/event/event-title";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteProps = { params: Promise<{ code: string }> };

export async function GET(_request: Request, context: RouteProps) {
  const user = await sessionUser();
  if (!user || user.is_anonymous) return NextResponse.json({ error: "Sign in." }, { status: 401 });
  const { code } = await context.params;
  const loaded = await loadManageEvent(code, user.id, "guests");
  if (loaded.kind === "missing") return NextResponse.json({ error: "Event not found" }, { status: 404 });
  if (loaded.kind !== "ok") return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  const book = await loadGuestBook(loaded.event.id);
  if (!book) return NextResponse.json({ error: "Guest lists need the guest-lists migration." }, { status: 409 });
  const name = csvFileName(eventTitleLine(loaded.event.name), "guests");
  return new NextResponse(guestsCsv(book, loaded.event.isPaid), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="guests.csv"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "no-store",
    },
  });
}

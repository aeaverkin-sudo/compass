import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/shared/lib/supabase/server";
import { normalizeEmail, normalizePhone, pastedTable, readGuestTable, type GuestImport } from "@/shared/event/guest-import";
import { addGuestsByHand } from "@/shared/services/event-guest-lists";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteProps = { params: Promise<{ code: string }> };

const PASTE_MAX_CHARS = 200_000;

function noStore(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/** One guest typed in, or pasted lines. Both go to Added by hand. */
export async function POST(request: Request, context: RouteProps) {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user || data.user.is_anonymous) return noStore({ error: "Sign in." }, 401);
  const { code } = await context.params;
  let body: { name?: unknown; contact?: unknown; text?: unknown } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return noStore({ error: "Bad request." }, 400);
  }

  let parsed: GuestImport;
  if (typeof body.text === "string") {
    if (body.text.length > PASTE_MAX_CHARS) return noStore({ error: "That is too long to paste at once." }, 400);
    const read = readGuestTable(pastedTable(body.text));
    if ("error" in read) return noStore({ error: "Paste at least one line." }, 400);
    parsed = read;
    if (parsed.guests.length === 0) {
      return noStore({ error: "No guests found. Each line needs a name, and an email or a phone." }, 400);
    }
  } else {
    const name = typeof body.name === "string" ? body.name.replace(/\s+/g, " ").trim().slice(0, 200) : "";
    const contact = typeof body.contact === "string" ? body.contact.trim() : "";
    if (!name) return noStore({ error: "Add a name." }, 400);
    const email = contact.includes("@") ? normalizeEmail(contact) : null;
    const phone = email ? null : normalizePhone(contact);
    if (!email && !phone) return noStore({ error: "Add an email or a phone." }, 400);
    parsed = { guests: [{ row: 1, name, email, phone }], skipped: [], rows: 1 };
  }

  try {
    const result = await addGuestsByHand(code, data.user.id, parsed);
    if (!result.ok) return noStore({ error: result.error }, result.status);
    return noStore({ report: result.report });
  } catch (error) {
    console.error("[events] add guests by hand", error);
    return noStore({ error: "Could not save." }, 500);
  }
}

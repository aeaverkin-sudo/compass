import { NextResponse } from "next/server";
import { mailOrigin } from "@/shared/lib/public-origin";
import { createAdminSupabaseClient } from "@/shared/lib/supabase/admin";
import { sessionUser } from "@/shared/lib/supabase/session-user";
import { deleteOwnCard } from "@/shared/services/card-delete";
import { sendWelcomeMail } from "@/shared/services/cold-entry";
import { prepareSignupCard, writeFirstPortfolio, type SignupBody } from "@/shared/services/signup";
import { readAccountStatus } from "@/shared/services/trial";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/** The first portfolio of someone who is already signed in. A second call returns the card that exists. */
export async function POST(request: Request) {
  const user = await sessionUser();
  if (!user || user.is_anonymous) return noStore({ error: "Sign in." }, 401);

  let body: SignupBody;
  try {
    body = (await request.json()) as SignupBody;
  } catch {
    return noStore({ error: "Could not create your profile." }, 400);
  }
  const prepared = prepareSignupCard(body ?? {});
  if ("error" in prepared) return noStore({ error: prepared.error }, 400);

  const admin = createAdminSupabaseClient();
  try {
    const existing = await admin
      .from("cards")
      .select("id, public_token, handle")
      .eq("owner_id", user.id)
      .order("created_at", { ascending: true })
      .limit(1);
    if (existing.error) throw new Error(existing.error.message);
    const row = existing.data?.[0] as { id: string; public_token: string | null; handle: string | null } | undefined;
    if (row) {
      return noStore({
        existing: true,
        cardId: row.id,
        publicToken: row.public_token ?? "",
        handle: row.handle,
      });
    }

    const account = await readAccountStatus(user.id);
    if (account.portfolioLimit < 1) return noStore({ error: "Could not create your profile." }, 403);

    const cardId = crypto.randomUUID();
    const now = new Date().toISOString();
    const written = await writeFirstPortfolio(admin, user.id, prepared, body, cardId, now);
    const listed = await admin
      .from("cards")
      .select("id, public_token, handle")
      .eq("owner_id", user.id)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true });
    if (listed.error) throw new Error(listed.error.message);
    const rows = (listed.data ?? []) as { id: string; public_token: string | null; handle: string | null }[];
    const keeper = rows[0];
    if (!keeper) throw new Error("missing");
    if (keeper.id !== written.cardId) {
      const dropped = await deleteOwnCard(user.id, written.cardId, { keepLast: true });
      if (dropped === "ok" || dropped === "missing") {
        return noStore({
          existing: true,
          cardId: keeper.id,
          publicToken: keeper.public_token ?? "",
          handle: keeper.handle,
        });
      }
    }
    const origin = mailOrigin(request);
    if (origin) {
      void sendWelcomeMail(user.id, written.cardId, "", origin, "google").catch((error) => {
        console.error("[mail] welcome", error instanceof Error ? error.message : error);
      });
    }
    return noStore(
      {
        cardId: written.cardId,
        publicToken: written.publicToken,
        handle: written.handle,
        fileItems: written.fileItems,
        itemIds: written.itemIds,
        itemZones: written.itemZones,
        ...(written.headerItemId && written.headerTitle
          ? { headerItemId: written.headerItemId, title: written.headerTitle }
          : {}),
        ...(written.door.saved ? { saved: true, savedName: written.door.savedName } : {}),
        ...(written.eventDoor.joined
          ? { joined: true, pay: written.eventDoor.pay === true, eventLookup: written.eventDoor.eventLookup }
          : {}),
        ...(written.door.warning || written.eventDoor.warning
          ? { warning: written.eventDoor.warning ?? written.door.warning }
          : {}),
      },
      201,
    );
  } catch (error) {
    console.error("[portfolio] first", error instanceof Error ? error.message : error);
    return noStore({ error: "Could not create your profile." }, 500);
  }
}

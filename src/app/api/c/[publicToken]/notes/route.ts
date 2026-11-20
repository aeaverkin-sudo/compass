import { NextResponse } from "next/server";
import { sessionUser } from "@/shared/lib/supabase/session-user";
import { loadPublicCard } from "@/shared/services/public-card";
import { ensureGuestClaimId } from "@/shared/services/note-guest-claim";
import { findOpenReceiptsForCard, completeReceiptCopy, deliveredFromReceipt, bindGuestReceipts } from "@/shared/services/note-receipts";
import { consumePendingNotes, openCodedNotes, previewPendingNotes } from "@/shared/services/notes-server";
import type { ClaimWinner } from "@/shared/services/note-receipts";
import type { DeliveredNote } from "@/shared/services/notes-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteProps = { params: Promise<{ publicToken: string }> };

function noStore(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

async function recipientClaim(userId: string | null): Promise<ClaimWinner> {
  const guestClaimId = await ensureGuestClaimId();
  return { guestClaimId, userId };
}

async function resumeOpenNotes(cardId: string, claim: ClaimWinner): Promise<DeliveredNote[]> {
  const open = await findOpenReceiptsForCard(cardId, claim);
  const notes: DeliveredNote[] = [];
  for (const row of open) {
    try {
      await completeReceiptCopy(row.id);
    } catch (reason) {
      console.error("[notes] resume copy", row.id, reason);
    }
    notes.push(...(await deliveredFromReceipt(row.id)));
  }
  if (claim.userId) {
    try {
      await bindGuestReceipts(claim.userId, claim.guestClaimId);
    } catch (reason) {
      console.error("[notes] resume bind", reason);
    }
  }
  return notes;
}

/**
 * Real browser viewers only. SSR and messenger crawlers never call this,
 * so they cannot burn the one-time notes.
 */
export async function POST(request: Request, context: RouteProps) {
  const { publicToken } = await context.params;

  let consumeOnShare = false;
  let viaQr = false;
  let code = "";
  try {
    const body = await request.json();
    if (body && typeof body === "object") {
      const record = body as { action?: unknown; via?: unknown; n?: unknown };
      if (record.action === "consume") consumeOnShare = true;
      if (record.via === "qr") viaQr = true;
      if (typeof record.n === "string") code = record.n;
    }
  } catch {
    // Visitors post with no body.
  }

  let loaded;
  try {
    loaded = await loadPublicCard(publicToken);
  } catch {
    return noStore({ error: "Could not read the card" }, 500);
  }
  if (!loaded) return noStore({ error: "Not found" }, 404);

  let userId: string | null = null;
  let registeredId: string | null = null;
  try {
    const session = await sessionUser();
    userId = session?.id ?? null;
    registeredId = session && !session.is_anonymous ? session.id : null;
  } catch {
    userId = null;
    registeredId = null;
  }

  if (userId && userId === loaded.ownerId) {
    if (viaQr) {
      try {
        const notes = await consumePendingNotes(loaded.card.id, "qr");
        return noStore({ notes, owner: true });
      } catch (error) {
        console.error("[notes] scan consume failed", error);
        return noStore({ error: "Could not close notes" }, 500);
      }
    }
    if (!consumeOnShare) {
      try {
        if (code && !viaQr) {
          const opened = await openCodedNotes(loaded.card.id, code, false);
          return noStore({ notes: opened.notes, ready: opened.ready, owner: true });
        }
        const notes = await previewPendingNotes(loaded.card.id);
        return noStore({ notes, ready: true, owner: true });
      } catch (error) {
        console.error("[notes] preview failed", error);
        return noStore({ error: "Could not read notes" }, 500);
      }
    }
    try {
      const notes = await consumePendingNotes(loaded.card.id, "share");
      return noStore({ notes, owner: true });
    } catch (error) {
      console.error("[notes] share consume failed", error);
      return noStore({ error: "Could not close notes" }, 500);
    }
  }

  try {
    const claim = await recipientClaim(registeredId);
    if (code && !viaQr) {
      const opened = await openCodedNotes(loaded.card.id, code, true, claim);
      return noStore({ notes: opened.notes, ready: opened.ready, owner: false });
    }
    if (viaQr) {
      const notes = await consumePendingNotes(loaded.card.id, "qr", claim);
      return noStore({ notes, ready: true, owner: false });
    }
    // No code and not a QR burn: do not start a new handoff; only resume this claimant's receipts.
    const notes = await resumeOpenNotes(loaded.card.id, claim);
    return noStore({ notes, ready: true, owner: false });
  } catch (error) {
    console.error("[notes] consume failed", error);
    return noStore({ error: "Could not open notes" }, 500);
  }
}

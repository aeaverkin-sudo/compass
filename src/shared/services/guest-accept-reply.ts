import { NextResponse } from "next/server";
import type { GuestAcceptResult } from "@/shared/services/guest-accept";

export function noStore(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/** One reply shape for the personal link and the open link. */
export function acceptReply(result: GuestAcceptResult) {
  if (!result.ok) return noStore({ error: result.error }, result.status);
  if (result.kind === "go") return noStore({ kind: "go", next: result.next, notice: result.notice ?? null });
  if (result.kind === "signin") return noStore({ kind: "signin", tokenHash: result.tokenHash, cardId: result.cardId, pay: result.pay ?? false });
  if (result.kind === "here") return noStore({ kind: "here", cardId: result.cardId, confirmEmail: result.confirmEmail ?? null, pay: result.pay ?? false });
  return noStore({ kind: "other-device" });
}

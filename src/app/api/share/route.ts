import { NextResponse } from "next/server";
import type { CardSnapshot } from "@/shared/types";
import { upsertShare } from "@/shared/lib/share-store";

type ShareBody = {
  token: string;
  snapshot: CardSnapshot;
  ownerName?: string;
};

export async function POST(request: Request) {
  const body = (await request.json()) as ShareBody;

  if (!body.token || !body.snapshot?.displayName) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  upsertShare(body.token, body.snapshot, body.ownerName ?? body.snapshot.displayName);
  return NextResponse.json({ token: body.token });
}

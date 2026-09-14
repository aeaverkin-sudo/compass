import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { shareStore } from "@/shared/lib/share-store";

export async function POST(request: Request) {
  const body = await request.json();
  const token = nanoid(12);
  shareStore.set(token, {
    portfolio: body.portfolio,
    ownerName: body.ownerName || "",
    createdAt: Date.now(),
  });
  return NextResponse.json({ token });
}

import { NextResponse } from "next/server";
import { getShare } from "@/shared/lib/share-store";

export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  const entry = getShare(token);

  if (!entry) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  entry.viewCount += 1;

  return NextResponse.json({
    snapshot: entry.snapshot,
    ownerName: entry.ownerName,
  });
}

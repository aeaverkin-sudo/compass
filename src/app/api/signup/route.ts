import { NextResponse } from "next/server";
import { createSignup, type SignupBody } from "@/shared/services/signup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(body: unknown, status: number) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  let body: SignupBody;
  try {
    body = (await request.json()) as SignupBody;
  } catch {
    return noStore({ error: "Could not create your profile." }, 400);
  }
  const result = await createSignup(body ?? {});
  if (!result.ok) return noStore({ error: result.error, kind: result.kind }, result.status);
  return noStore({ cardId: result.cardId, publicToken: result.publicToken, fileItems: result.fileItems }, 201);
}

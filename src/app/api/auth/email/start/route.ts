import { NextResponse } from "next/server";
import { requireOwnerId } from "@/shared/services/attachment-api";
import { beginEmail, isEmail, MAIL_NOT_CONNECTED } from "@/shared/services/email-signup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const owner = await requireOwnerId();
  if (!owner.ok) return NextResponse.json({ error: owner.error }, { status: owner.status });

  let email = "";
  try {
    const body = (await request.json()) as { email?: unknown };
    email = typeof body.email === "string" ? body.email : "";
  } catch {
    email = "";
  }
  if (!isEmail(email.trim().toLowerCase())) {
    return NextResponse.json({ error: "Enter an email" }, { status: 400 });
  }

  try {
    const branch = await beginEmail(owner.id, email);
    return NextResponse.json(branch, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "mail_not_configured") {
      return NextResponse.json({ error: MAIL_NOT_CONNECTED }, { status: 503 });
    }
    console.error("[email] start", error);
    return NextResponse.json({ error: "Could not start email sign-in" }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { requireOwnerId } from "@/shared/services/attachment-api";
import { isEmail, verifyEmailChange } from "@/shared/services/email-signup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const owner = await requireOwnerId();
  if (!owner.ok) return NextResponse.json({ error: owner.error }, { status: owner.status });

  let email = "";
  let code = "";
  try {
    const body = (await request.json()) as { email?: unknown; code?: unknown };
    email = typeof body.email === "string" ? body.email : "";
    code = typeof body.code === "string" ? body.code : "";
  } catch {
    email = "";
  }
  if (!isEmail(email.trim().toLowerCase()) || code.trim().length < 8) {
    return NextResponse.json({ error: "Enter the code" }, { status: 400 });
  }

  try {
    const branch = await verifyEmailChange(owner.id, email, code);
    return NextResponse.json(branch, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "rate_limited") {
      return NextResponse.json({ error: "Too many attempts" }, { status: 429 });
    }
    if (message === "expired") {
      return NextResponse.json({ error: "That code has expired" }, { status: 400 });
    }
    if (message === "wrong_code") {
      return NextResponse.json({ error: "Wrong code" }, { status: 400 });
    }
    if (message === "That email is already in use") {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    console.error("[email] change verify", error);
    return NextResponse.json({ error: "Could not change the email" }, { status: 500 });
  }
}

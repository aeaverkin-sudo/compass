import { NextResponse } from "next/server";
import { publicOrigin } from "@/shared/lib/public-origin";
import { isEmail, MAIL_NOT_CONNECTED, sendResetLink } from "@/shared/services/email-signup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
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
    await sendResetLink(email, publicOrigin(request));
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "mail_not_configured") {
      return NextResponse.json({ error: MAIL_NOT_CONNECTED }, { status: 503 });
    }
    console.error("[email] reset", error);
    return NextResponse.json({ error: "Could not send the reset link" }, { status: 500 });
  }
}

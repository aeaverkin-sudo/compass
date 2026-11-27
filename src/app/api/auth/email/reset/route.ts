import { NextResponse } from "next/server";
import { publicOrigin } from "@/shared/lib/public-origin";
import { isEmail, MAIL_NOT_CONNECTED, prepareResetMail, sendResetLink } from "@/shared/services/email-signup";
import { renderClientIp } from "@/shared/services/mail-limit";

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
    const gate = await prepareResetMail(email, renderClientIp(request));
    if (!gate.ok) {
      return NextResponse.json({ error: gate.error }, { status: gate.status, headers: { "Cache-Control": "no-store" } });
    }
    const mailed = await sendResetLink(email, publicOrigin(request));
    if (mailed) await gate.markSent();
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "mail_not_configured") {
      return NextResponse.json({ error: MAIL_NOT_CONNECTED }, { status: 503 });
    }
    console.error("[email] reset", error instanceof Error ? error.name : "send");
    return NextResponse.json({ error: "Could not send the reset link" }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { isEmail, MAIL_NOT_CONNECTED, sendResetLink } from "@/shared/services/email-signup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function originOf(request: Request) {
  const forwarded = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwarded || request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ?? "https";
  return host ? `${proto}://${host}` : new URL(request.url).origin;
}

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
    await sendResetLink(email, originOf(request));
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

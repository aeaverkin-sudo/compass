import { NextResponse } from "next/server";
import { publicOrigin } from "@/shared/lib/public-origin";
import { beginSignupCode, MAIL_NOT_CONNECTED } from "@/shared/services/email-signup";
import { renderClientIp } from "@/shared/services/mail-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/** Send a code, or the taken-address letter. The body does not say which. */
export async function POST(request: Request) {
  let email = "";
  let resend = false;
  try {
    const body = (await request.json()) as { email?: unknown; resend?: unknown };
    email = typeof body.email === "string" ? body.email : "";
    resend = body.resend === true;
  } catch {
    email = "";
  }
  try {
    const result = await beginSignupCode(email, renderClientIp(request), publicOrigin(request), resend);
    if (!result.ok) return noStore({ error: result.error }, result.status);
    return noStore({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "mail_not_configured") return noStore({ error: MAIL_NOT_CONNECTED }, 503);
    console.error("[signup] code", error instanceof Error ? error.name : "send");
    return noStore({ error: "Could not send the code." }, 500);
  }
}

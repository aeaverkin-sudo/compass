import { NextResponse } from "next/server";
import { publicOrigin } from "@/shared/lib/public-origin";
import { requireOwnerId } from "@/shared/services/attachment-api";
import { sendWelcomeMail } from "@/shared/services/cold-entry";
import { isEmail, sessionHasCard, verifyEmailCode } from "@/shared/services/email-signup";
import { clearTrialClock } from "@/shared/services/trial";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const owner = await requireOwnerId();
  if (!owner.ok) return NextResponse.json({ error: owner.error }, { status: owner.status });

  let email = "";
  let code = "";
  let password = "";
  try {
    const body = (await request.json()) as { email?: unknown; code?: unknown; password?: unknown };
    email = typeof body.email === "string" ? body.email : "";
    code = typeof body.code === "string" ? body.code : "";
    password = typeof body.password === "string" ? body.password : "";
  } catch {
    email = "";
  }
  if (!isEmail(email.trim().toLowerCase()) || code.trim().length < 8) {
    return NextResponse.json({ error: "Enter the code" }, { status: 400 });
  }
  if (password.trim().length < 8) {
    return NextResponse.json({ error: "Use at least 8 characters for the password." }, { status: 400 });
  }

  try {
    const branch = await verifyEmailCode(owner.id, email, code, password);
    if (branch.mode === "ok") {
      await clearTrialClock(owner.id);
      const hasCard = await sessionHasCard(owner.id).catch(() => false);
      void sendWelcomeMail(owner.id, publicOrigin(request), "password", hasCard).catch((error) => {
        console.error("[mail] welcome", error instanceof Error ? error.message : "send failed");
      });
    }
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
    if (message === "short_password") {
      return NextResponse.json({ error: "Use at least 8 characters for the password." }, { status: 400 });
    }
    console.error("[email] verify");
    return NextResponse.json({ error: "Could not check the code" }, { status: 500 });
  }
}

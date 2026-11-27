import { NextResponse } from "next/server";
import { isEmail, verifySignupCode } from "@/shared/services/email-signup";
import { createSignup, type SignupBody } from "@/shared/services/signup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(body: unknown, status: number) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  let body: SignupBody & { code?: unknown };
  try {
    body = (await request.json()) as SignupBody & { code?: unknown };
  } catch {
    return noStore({ error: "Could not create your profile." }, 400);
  }
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const code = typeof body.code === "string" ? body.code.trim() : "";
  if (!isEmail(email)) return noStore({ error: "Add your email." }, 400);
  if (!/^\d{6}$/.test(code)) return noStore({ error: "Enter the code" }, 400);
  try {
    const verdict = await verifySignupCode(email, code);
    if (verdict === "limited") return noStore({ error: "Too many attempts" }, 429);
    if (verdict === "expired") return noStore({ error: "That code has expired" }, 400);
    if (verdict !== "ok") return noStore({ error: "Wrong code" }, 400);
  } catch (error) {
    console.error("[signup] code", error instanceof Error ? error.name : "check");
    return noStore({ error: "Could not create the account." }, 500);
  }
  const result = await createSignup(body);
  if (!result.ok) return noStore({ error: result.error }, result.status);
  return noStore(
    {
      ...(result.saved ? { saved: true, savedName: result.savedName } : {}),
      ...(result.warning ? { warning: result.warning } : {}),
    },
    201,
  );
}

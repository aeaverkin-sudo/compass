import { NextResponse } from "next/server";
import { mailOrigin } from "@/shared/lib/public-origin";
import { requestIp } from "@/shared/services/event-pass-guard";
import { mailSaveLink } from "@/shared/services/save-link";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TOKEN_RE = /^[A-Za-z0-9_-]{16,64}$/;

export async function POST(request: Request) {
  let token = "";
  let email = "";
  try {
    const body = (await request.json()) as { token?: unknown; email?: unknown };
    token = typeof body.token === "string" ? body.token : "";
    email = typeof body.email === "string" ? body.email : "";
  } catch {
    token = "";
  }
  if (!TOKEN_RE.test(token)) return NextResponse.json({ error: "This card is not available" }, { status: 404 });

  try {
    const result = await mailSaveLink({ token, email, origin: mailOrigin(request), ip: requestIp(request) });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[save-link]", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Could not send the link" }, { status: 500 });
  }
}

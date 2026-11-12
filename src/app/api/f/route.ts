import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/shared/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STEPS = new Set([
  "landing_view",
  "landing_cta",
  "signin_view",
  "create_view",
  "create_submit",
  "create_red",
  "signup_ok",
  "signup_fail",
]);
const CLIENTS = new Set(["telegram", "instagram", "pwa", "safari", "chrome", "other"]);
const SOURCES = new Set([
  "qr",
  "google",
  "telegram",
  "instagram",
  "facebook",
  "linkedin",
  "whatsapp",
  "x",
  "adedme",
  "other",
  "direct",
]);
const SESSION = /^[a-z0-9]{12,32}$/;
const DETAIL = /^[a-z0-9_,:-]{1,60}$/;
const UTM = /^[a-z0-9_-]{1,30}$/;

function quiet() {
  return new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

export async function POST(request: Request) {
  try {
    const declared = Number(request.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > 1024) return quiet();
    const raw = await request.text();
    if (raw.length > 1024) return quiet();
    const body = JSON.parse(raw) as { session?: unknown; step?: unknown; detail?: unknown; client?: unknown; source?: unknown };
    const step = text(body.step);
    const session = text(body.session);
    const client = text(body.client);
    const source = text(body.source).toLowerCase();
    const detail = body.detail === undefined ? null : text(body.detail);
    if (!STEPS.has(step) || !SESSION.test(session) || !CLIENTS.has(client)) return quiet();
    if (!SOURCES.has(source) && !UTM.test(source)) return quiet();
    if (detail !== null && !DETAIL.test(detail)) return quiet();
    const admin = createAdminSupabaseClient();
    const { error } = await admin.from("funnel_events").insert({ session, step, detail, client, source });
    if (error) console.error("[funnel]", error.code ?? "write");
  } catch {
    console.error("[funnel]", "drop");
  }
  return quiet();
}

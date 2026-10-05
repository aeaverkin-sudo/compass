import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/shared/lib/supabase/server";
import { importPaymentStatement } from "@/shared/services/event-payment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteProps = { params: Promise<{ code: string }> };

function noStore(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request, context: RouteProps) {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return noStore({ error: "Sign in to import a statement." }, 401);
  const { code } = await context.params;

  let text = "";
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return noStore({ error: "Choose a CSV file." }, 400);
    text = await file.text();
  } catch {
    return noStore({ error: "Choose a CSV file." }, 400);
  }

  try {
    const result = await importPaymentStatement(code, data.user.id, text);
    if (!result.ok) return noStore({ error: result.error }, result.status);
    if (!("matched" in result)) return noStore({ error: "Could not import the statement." }, 500);
    return noStore({ matched: result.matched, total: result.total, unmatched: result.unmatched });
  } catch (error) {
    console.error("[events] payment import", error);
    return noStore({ error: "Could not import the statement." }, 500);
  }
}

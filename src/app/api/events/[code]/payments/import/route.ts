import { NextResponse } from "next/server";
import { extractText, getDocumentProxy } from "unpdf";
import { createServerSupabaseClient } from "@/shared/lib/supabase/server";
import { importPaymentStatement, statementLinesFromCsv } from "@/shared/services/event-payment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteProps = { params: Promise<{ code: string }> };

const MAX_BYTES = 10 * 1024 * 1024;

function noStore(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function isPdf(file: File): boolean {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

function isCsv(file: File): boolean {
  return file.type === "text/csv" || file.type === "application/vnd.ms-excel" || file.name.toLowerCase().endsWith(".csv");
}

export async function POST(request: Request, context: RouteProps) {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return noStore({ error: "Sign in to import a statement." }, 401);
  const { code } = await context.params;

  let lines: string[] = [];
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return noStore({ error: "Choose a CSV or PDF." }, 400);
    if (file.size > MAX_BYTES) return noStore({ error: "That file is too large." }, 400);
    if (isPdf(file)) {
      const pdf = await getDocumentProxy(new Uint8Array(await file.arrayBuffer()));
      const extracted = await extractText(pdf, { mergePages: true });
      const text = extracted.text.trim();
      if (!text) return noStore({ error: "This PDF has no text. Export a CSV from your bank instead." }, 400);
      lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    } else if (isCsv(file)) {
      lines = statementLinesFromCsv(await file.text());
    } else {
      return noStore({ error: "Choose a CSV or PDF." }, 400);
    }
  } catch {
    return noStore({ error: "Could not read that file." }, 400);
  }

  try {
    const result = await importPaymentStatement(code, data.user.id, lines);
    if (!result.ok) return noStore({ error: result.error }, result.status);
    if (!("report" in result)) return noStore({ error: "Could not read the statement." }, 500);
    return noStore({ report: result.report });
  } catch (error) {
    console.error("[events] payment import", error);
    return noStore({ error: "Could not read the statement." }, 500);
  }
}

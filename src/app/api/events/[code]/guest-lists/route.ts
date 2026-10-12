import { NextResponse } from "next/server";
import { readSheet } from "read-excel-file/node";
import { createServerSupabaseClient } from "@/shared/lib/supabase/server";
import { GUEST_FILE_MAX_BYTES, readGuestTable } from "@/shared/event/guest-import";
import { importGuestList } from "@/shared/services/event-guest-lists";
import { tableFrom } from "@/shared/services/event-payment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteProps = { params: Promise<{ code: string }> };

function noStore(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function isXlsx(file: File): boolean {
  return (
    file.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" || file.name.toLowerCase().endsWith(".xlsx")
  );
}

function isCsv(file: File): boolean {
  const name = file.name.toLowerCase();
  return file.type === "text/csv" || name.endsWith(".csv") || name.endsWith(".txt");
}

function cellText(value: unknown): string {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
}

export async function POST(request: Request, context: RouteProps) {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return noStore({ error: "Sign in to upload a list." }, 401);
  const { code } = await context.params;

  let table: string[][] = [];
  let fileName = "";
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return noStore({ error: "Choose a CSV or Excel file." }, 400);
    if (file.size > GUEST_FILE_MAX_BYTES) return noStore({ error: "That file is over 5 MB." }, 400);
    fileName = file.name;
    if (isXlsx(file)) {
      const sheet = await readSheet(Buffer.from(await file.arrayBuffer()));
      table = sheet.map((row) => row.map(cellText));
    } else if (isCsv(file)) {
      table = tableFrom(await file.text());
    } else {
      return noStore({ error: "Choose a CSV or Excel file (.xlsx)." }, 400);
    }
  } catch {
    return noStore({ error: "Could not read that file." }, 400);
  }

  const parsed = readGuestTable(table);
  if ("error" in parsed) return noStore({ error: parsed.error }, 400);
  if (parsed.guests.length === 0) {
    return noStore({ error: "No guests found. Each row needs a name, and an email or a phone." }, 400);
  }

  try {
    const result = await importGuestList(code, data.user.id, fileName, parsed);
    if (!result.ok) return noStore({ error: result.error }, result.status);
    return noStore({ report: result.report });
  } catch (error) {
    console.error("[events] guest list import", error);
    return noStore({ error: "Could not save the list." }, 500);
  }
}

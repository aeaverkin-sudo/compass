import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { publicOrigin } from "@/shared/lib/public-origin";
import { sendFreezeMails } from "@/shared/services/freeze-mail";
import { sendReminders } from "@/shared/services/event-mails";
import { runPurge } from "@/shared/services/trial-purge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET ?? "";
  const header = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  if (!secret || header.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(header), Buffer.from(expected));
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  try {
    const purged = await runPurge();
    let freezeMails = 0;
    try {
      freezeMails = await sendFreezeMails(publicOrigin(request));
    } catch (mailError) {
      console.error("[purge] freeze mails", mailError);
    }
    let reminders = 0;
    try {
      reminders = await sendReminders(publicOrigin(request));
    } catch (mailError) {
      console.error("[purge] reminders", mailError);
    }
    const report = { ...purged, freezeMails, reminders };
    console.info("[purge]", report);
    return NextResponse.json(report, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[purge]", error);
    return NextResponse.json({ error: "Could not purge" }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}

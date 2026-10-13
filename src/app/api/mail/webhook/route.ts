import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { markBounced } from "@/shared/services/event-mails";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TOLERANCE_S = 5 * 60;

function noStore(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/** Svix: HMAC-SHA256 of `id.timestamp.body` with the base64 secret after `whsec_`. */
function verified(secret: string, id: string, timestamp: string, signatures: string, body: string): boolean {
  const seconds = Number(timestamp);
  if (!Number.isFinite(seconds) || Math.abs(Date.now() / 1000 - seconds) > TOLERANCE_S) return false;
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest();
  return signatures.split(" ").some((entry) => {
    const [version, value] = entry.split(",");
    if (version !== "v1" || !value) return false;
    const given = Buffer.from(value, "base64");
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

/** Resend: a bounce or a complaint stops mail to that guest. */
export async function POST(request: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET?.trim();
  if (!secret) return noStore({ error: "Webhook is not set up." }, 503);
  const id = request.headers.get("svix-id") ?? "";
  const timestamp = request.headers.get("svix-timestamp") ?? "";
  const signatures = request.headers.get("svix-signature") ?? "";
  const body = await request.text();
  if (!id || !timestamp || !signatures || !verified(secret, id, timestamp, signatures, body)) {
    return noStore({ error: "Bad signature." }, 401);
  }

  let event: { type?: string; data?: { email_id?: string } } = {};
  try {
    event = JSON.parse(body) as typeof event;
  } catch {
    return noStore({ error: "Bad request." }, 400);
  }
  const emailId = event.data?.email_id;
  if ((event.type === "email.bounced" || event.type === "email.complained") && emailId) {
    try {
      await markBounced(emailId);
    } catch (error) {
      console.error("[mail] webhook", error);
      return noStore({ error: "Could not save." }, 500);
    }
  }
  return noStore({ ok: true });
}

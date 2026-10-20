import { NextResponse } from "next/server";
import { passTokenMatches, registerPassDevice, unregisterPassDevice } from "@/shared/services/wallet-registration";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteProps = { params: Promise<{ deviceLibraryIdentifier: string; passTypeIdentifier: string; serialNumber: string }> };

const DEVICE = /^[A-Za-z0-9_-]{8,128}$/;

function noStore(status: number) {
  return new NextResponse(null, { status, headers: { "Cache-Control": "no-store" } });
}

function appleToken(request: Request): string {
  const match = /^ApplePass\s+(\S+)$/i.exec(request.headers.get("authorization") ?? "");
  return match?.[1] ?? "";
}

function decoded(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

async function knownPass(request: Request, context: RouteProps) {
  const { deviceLibraryIdentifier, passTypeIdentifier, serialNumber } = await context.params;
  const device = decoded(deviceLibraryIdentifier);
  const passType = decoded(passTypeIdentifier);
  const serial = decoded(serialNumber);
  if (!DEVICE.test(device) || !process.env.APPLE_PASS_TYPE_ID || passType !== process.env.APPLE_PASS_TYPE_ID) return null;
  if (!passTokenMatches(serial, appleToken(request))) return null;
  return { device, serial };
}

/** Wallet calls this once the pass is on the device. */
export async function POST(request: Request, context: RouteProps) {
  const pass = await knownPass(request, context);
  if (!pass) return noStore(401);
  const body = (await request.json().catch(() => null)) as { pushToken?: unknown } | null;
  const pushToken = typeof body?.pushToken === "string" ? body.pushToken.trim() : "";
  if (pushToken.length < 16 || pushToken.length > 512 || /\s/.test(pushToken)) return noStore(400);
  try {
    const saved = await registerPassDevice(pass.serial, pass.device, pushToken);
    if (!saved) return noStore(401);
    return noStore(saved === "created" ? 201 : 200);
  } catch (error) {
    console.error("[wallet] register", error instanceof Error ? error.message : error);
    return noStore(500);
  }
}

/** Wallet calls this when the pass is deleted. */
export async function DELETE(request: Request, context: RouteProps) {
  const pass = await knownPass(request, context);
  if (!pass) return noStore(401);
  try {
    const removed = await unregisterPassDevice(pass.serial, pass.device);
    return noStore(removed ? 200 : 401);
  } catch (error) {
    console.error("[wallet] unregister", error instanceof Error ? error.message : error);
    return noStore(500);
  }
}

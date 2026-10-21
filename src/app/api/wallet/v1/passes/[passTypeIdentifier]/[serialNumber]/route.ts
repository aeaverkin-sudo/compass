import { NextResponse } from "next/server";
import { passTokenMatches, serialFromWalletPath } from "@/shared/services/wallet-registration";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteProps = { params: Promise<{ passTypeIdentifier: string; serialNumber: string }> };

function decoded(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function appleToken(request: Request): string {
  const match = /^ApplePass\s+(\S+)$/i.exec(request.headers.get("authorization") ?? "");
  return match?.[1] ?? "";
}

/** The pass on the device is still current. Wallet keeps it, including a `-2` / `-3` serial. */
export async function GET(request: Request, context: RouteProps) {
  const { passTypeIdentifier, serialNumber } = await context.params;
  const passType = decoded(passTypeIdentifier);
  const serial = serialFromWalletPath(new URL(request.url).pathname) ?? decoded(serialNumber);
  if (!process.env.APPLE_PASS_TYPE_ID || passType !== process.env.APPLE_PASS_TYPE_ID) {
    return new NextResponse(null, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  if (!passTokenMatches(serial, appleToken(request))) {
    return new NextResponse(null, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  return new NextResponse(null, { status: 304, headers: { "Cache-Control": "no-store" } });
}

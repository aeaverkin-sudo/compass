import { NextResponse } from "next/server";
import { serialsForDevice } from "@/shared/services/wallet-registration";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteProps = { params: Promise<{ deviceLibraryIdentifier: string; passTypeIdentifier: string }> };

const DEVICE = /^[A-Za-z0-9_-]{8,128}$/;

function decoded(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** Passes this device registered. 204 when none of them changed. */
export async function GET(request: Request, context: RouteProps) {
  const { deviceLibraryIdentifier, passTypeIdentifier } = await context.params;
  const device = decoded(deviceLibraryIdentifier);
  const passType = decoded(passTypeIdentifier);
  if (!DEVICE.test(device) || !process.env.APPLE_PASS_TYPE_ID || passType !== process.env.APPLE_PASS_TYPE_ID) {
    return new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  }
  try {
    const found = await serialsForDevice(device);
    const since = new URL(request.url).searchParams.get("passesUpdatedSince");
    if (!found || (since && Number(since) >= Number(found.updated))) {
      return new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
    }
    return NextResponse.json(
      { serialNumbers: found.serials, lastUpdated: found.updated },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[wallet] registrations", error instanceof Error ? error.message : error);
    return new NextResponse(null, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}

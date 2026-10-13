import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { guestEntryPath } from "@/shared/services/event-guest-pass";
import { ScanScreen } from "./scan-screen";

export const metadata: Metadata = { title: "Scan" };

type PageProps = { searchParams: Promise<{ g?: string | string[] }> };

/** `?g=` from the back of a guest's Wallet pass: the personal link enters first, then the scanner opens. */
export default async function ScanPage({ searchParams }: PageProps) {
  const query = await searchParams;
  const token = Array.isArray(query.g) ? query.g[0] : query.g;
  if (token) {
    const entry = await guestEntryPath(token);
    if (entry) redirect(`${entry}&then=scan`);
  }
  return <ScanScreen />;
}

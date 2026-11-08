"use client";

import { usePathname } from "next/navigation";
import { SignedOutGate } from "@/shared/components/signed-out-gate";

/** A contact opened from Network stays. Every other Network screen is the owner's. */
export default function NetworkLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  if (path === "/network/c" || path.startsWith("/network/c/")) return children;
  return <SignedOutGate>{children}</SignedOutGate>;
}

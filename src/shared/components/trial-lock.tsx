"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAccountStatus } from "@/shared/hooks/use-account-status";

function lockedPath(pathname: string) {
  return pathname === "/main" || pathname.startsWith("/main/") || pathname === "/profile" || pathname.startsWith("/profile/") || pathname === "/network" || pathname.startsWith("/network/");
}

/** Fog over the owner's app once the 60h trial has ended. Register is the only way out. */
export function TrialLock() {
  const account = useAccountStatus();
  const pathname = usePathname();
  if (!account?.frozen || !lockedPath(pathname)) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-white/75 px-8 backdrop-blur-md">
      <div className="w-full max-w-xs text-center text-[var(--ink)]">
        <p className="t-body">Your trial has ended.</p>
        <p className="mt-3 t-meta">Register to unlock your profile and keep your data.</p>
        <Link
          href="/register"
          className="press mt-6 inline-block border-0 bg-sky px-[21.6px] py-[10.8px] t-caps text-[var(--ink)]"
        >
          Register
        </Link>
      </div>
    </div>
  );
}

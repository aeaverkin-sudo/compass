"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAppStore } from "@/shared/store/app-store";
import { BottomNav } from "./bottom-nav";

const PUBLIC_PATHS = ["/onboarding", "/share", "/receive"];

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const hydrated = useAppStore((s) => s.hydrated);
  const onboarded = useAppStore((s) => s.user.onboarded);

  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));
  const showNav = !isPublic && onboarded;

  useEffect(() => {
    if (!hydrated) return;
    if (!onboarded && pathname !== "/onboarding") {
      router.replace("/onboarding");
    }
    if (onboarded && pathname === "/onboarding") {
      router.replace("/portfolio");
    }
  }, [hydrated, onboarded, pathname, router]);

  if (!hydrated && !isPublic) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#faf9f7]">
        <div className="h-5 w-5 animate-spin border border-[#1a1a1a] border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#faf9f7]">
      <main className={showNav ? "pb-20" : ""}>{children}</main>
      {showNav && <BottomNav />}
    </div>
  );
}

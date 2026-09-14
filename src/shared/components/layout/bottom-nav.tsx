"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/shared/lib/utils";

const NAV = [
  { href: "/portfolio", label: "Portfolio" },
  { href: "/people", label: "People" },
  { href: "/events", label: "Events" },
  { href: "/matching", label: "Match" },
  { href: "/settings", label: "More" },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-[#1a1a1a]/10 bg-[#faf9f7]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-sm">
      <div className="mx-auto flex max-w-lg items-center justify-around px-2 py-3">
        {NAV.map(({ href, label }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "px-2 py-1 text-[10px] tracking-wide uppercase transition",
                active ? "font-semibold text-[#1a1a1a]" : "font-normal text-[#aaa]",
              )}
            >
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Try it — ADED" };

/** Stub until accounts: photo and name, anonymous session, no sign-up. */
export default function TryPage() {
  return (
    <main className="compass-main h-dvh overflow-y-auto bg-white px-8 pt-24 text-[#111]">
      <h1 className="text-[32px] leading-none font-light">Try it</h1>
      <p className="mt-4 max-w-sm text-[15px] leading-snug font-light">
        Photo and a name, then a portfolio. No sign-up. That screen is not here yet.
      </p>
      <Link href="/register" className="mt-8 inline-block text-[13px] font-light underline">
        Create your account
      </Link>
    </main>
  );
}

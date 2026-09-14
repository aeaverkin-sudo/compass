"use client";

import { useRouter } from "next/navigation";
import { useAppStore } from "@/shared/store/app-store";

export function OnboardingScreen() {
  const router = useRouter();
  const onboard = useAppStore((s) => s.onboard);

  const handleStart = () => {
    onboard();
    router.replace("/portfolio");
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#faf9f7] px-6">
      <div className="w-full max-w-sm text-center">
        <p className="mb-2 text-[11px] tracking-[0.2em] text-[#888] uppercase">Compass</p>
        <h1 className="mb-4 text-2xl font-normal text-[#1a1a1a]">Personal portfolio</h1>
        <p className="mb-10 text-[14px] leading-relaxed text-[#666]">
          Build, preview and share your identity — directly on one screen.
        </p>
        <button
          type="button"
          onClick={handleStart}
          className="w-full border border-[#1a1a1a] py-3.5 text-[13px] tracking-wide uppercase"
        >
          Continue
        </button>
      </div>
    </div>
  );
}

"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { MainScreen } from "@main/components/main-screen";
import { useStoreHydrated } from "@/shared/hooks/use-store-hydrated";
import { useAppStore } from "@/shared/store/app-store";

function applyMainChrome() {
  document.documentElement.classList.add("compass-ready");

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute("content", "#ffffff");
  }
}

export default function MainPage() {
  const router = useRouter();
  const hydrated = useStoreHydrated();
  const onboarded = useAppStore((state) => state.user.onboarded);

  useEffect(() => {
    applyMainChrome();
  }, []);

  useEffect(() => {
    if (hydrated && !onboarded) {
      router.replace("/");
    }
  }, [hydrated, onboarded, router]);

  if (!hydrated || !onboarded) {
    return <div className="fixed inset-0 bg-background" aria-hidden />;
  }

  return <MainScreen />;
}

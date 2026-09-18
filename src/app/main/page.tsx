"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { MainScreen } from "@main/components/main-screen";
import { useStoreHydrated } from "@/shared/hooks/use-store-hydrated";
import { useAppStore } from "@/shared/store/app-store";

export default function MainPage() {
  const router = useRouter();
  const hydrated = useStoreHydrated();
  const onboarded = useAppStore((state) => state.user.onboarded);

  useEffect(() => {
    if (hydrated && !onboarded) {
      router.replace("/");
    }
  }, [hydrated, onboarded, router]);

  if (!hydrated || !onboarded) {
    return <div className="h-lvh bg-background" aria-hidden />;
  }

  return <MainScreen />;
}

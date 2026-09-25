"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { TestCardScreen } from "../../../проба-визитки/test-screen";
import { useStoreHydrated } from "@/shared/hooks/use-store-hydrated";
import { useAppStore } from "@/shared/store/app-store";

export default function TryPage() {
  const router = useRouter();
  const hydrated = useStoreHydrated();
  const onboarded = useAppStore((state) => state.user.onboarded);

  useEffect(() => {
    document.documentElement.classList.add("compass-ready");
  }, []);

  useEffect(() => {
    if (hydrated && !onboarded) router.replace("/");
  }, [hydrated, onboarded, router]);

  if (!hydrated || !onboarded) {
    return <div className="fixed inset-0 bg-white" aria-hidden />;
  }

  return <TestCardScreen />;
}

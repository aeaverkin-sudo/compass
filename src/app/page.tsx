"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { LandingPage } from "@landing/components/landing-page";
import { useSessionBootstrap } from "@/shared/hooks/use-session-bootstrap";
import { useStoreHydrated } from "@/shared/hooks/use-store-hydrated";
import { useAppStore } from "@/shared/store/app-store";

export default function Home() {
  const router = useRouter();
  const hydrated = useStoreHydrated();
  const sessionReady = useSessionBootstrap();
  const onboarded = useAppStore((state) => state.user.onboarded);

  useEffect(() => {
    if (hydrated && sessionReady && onboarded) {
      router.replace("/main");
    }
  }, [hydrated, sessionReady, onboarded, router]);

  if (!hydrated || !sessionReady || onboarded) {
    return <div className="h-lvh bg-background" aria-hidden />;
  }

  return <LandingPage />;
}

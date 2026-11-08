"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useRegistrationRequired, useSessionBootstrap } from "@/shared/hooks/use-session-bootstrap";
import { useStoreHydrated } from "@/shared/hooks/use-store-hydrated";
import { signInPath } from "@/shared/lib/registered-device";

/** An owner screen after Sign out. Blank until we know, then Sign in. The account stays hidden. */
export function SignedOutGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const hydrated = useStoreHydrated();
  const sessionReady = useSessionBootstrap();
  const needsSignIn = useRegistrationRequired();

  useEffect(() => {
    if (!hydrated || !sessionReady || !needsSignIn) return;
    router.replace(signInPath());
  }, [hydrated, sessionReady, needsSignIn, router]);

  if (!hydrated || !sessionReady || needsSignIn) {
    return <div className="fixed inset-0 bg-white" aria-hidden />;
  }
  return children;
}

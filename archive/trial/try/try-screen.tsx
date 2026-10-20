"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LandingPage } from "@landing/components/landing-page";
import { TrialGate } from "./trial-gate";
import { useRegistrationRequired, useSessionBootstrap } from "@/shared/hooks/use-session-bootstrap";
import { deviceWasRegistered } from "@/shared/lib/registered-device";
import { isEventJoinPath } from "@/shared/event/lookup";
import { createBrowserSupabaseClient } from "@/shared/lib/supabase/browser";
import { upsertCardScalars } from "@/shared/services/card-sync";
import { useStoreHydrated } from "@/shared/hooks/use-store-hydrated";
import { isCardReady, useAppStore } from "@/shared/store/app-store";

/**
 * Trial onboarding: the no-sign-up gate, then photo and name.
 * Reached from Try without sign up.
 * A phone that already flipped onboarded without a finished portfolio still sees that landing.
 * The 60h clock starts when both gate boxes are accepted.
 * An event join passes next=/e/<lookup>/join and returns there once the card is saved.
 */
export function TryScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const nextRaw = params.get("next");
  const next = nextRaw && isEventJoinPath(nextRaw) ? nextRaw : null;
  const fresh = params.get("new") === "1";
  const hydrated = useStoreHydrated();
  const sessionReady = useSessionBootstrap();
  const needsSignIn = useRegistrationRequired();
  const [step, setStep] = useState<"wait" | "gate" | "card">("wait");

  useEffect(() => {
    if (!hydrated || !sessionReady || needsSignIn) return;
    let cancelled = false;

    void (async () => {
      const supabase = createBrowserSupabaseClient();
      const { data } = await supabase.auth.getUser();
      const user = data.user;

      if (!user) {
        if (deviceWasRegistered()) return;
        const signed = await supabase.auth.signInAnonymously();
        if (cancelled || signed.error || !signed.data.user?.is_anonymous) return;
      }

      if (cancelled) return;
      const registered = Boolean(user && !user.is_anonymous);
      if (!registered) {
        const statusResponse = await fetch("/api/account/status", { cache: "no-store" });
        const status = statusResponse.ok
          ? ((await statusResponse.json()) as { trial?: boolean; frozen?: boolean })
          : null;
        if (cancelled) return;
        if (status?.frozen) {
          router.replace(next ?? "/main");
          return;
        }
        if (!status?.trial) {
          setStep("gate");
          return;
        }
      }
      if (fresh) {
        setStep("card");
        return;
      }
      const state = useAppStore.getState();
      const started = state.cards.some((card) => isCardReady(card));
      if (!started && state.user.onboarded) {
        useAppStore.setState({ user: { ...state.user, onboarded: false } });
      }
      if (started) {
        if (!state.user.onboarded) {
          useAppStore.setState({ user: { ...state.user, onboarded: true } });
        }
        const card = state.cards.find((entry) => isCardReady(entry));
        if (next && card) {
          await upsertCardScalars(card);
          const saved = await supabase.from("cards").select("id").eq("id", card.id).maybeSingle();
          if (!saved.data) {
            if (!cancelled) setStep("card");
            return;
          }
        }
        if (!cancelled) router.replace(next ?? "/main");
        return;
      }
      setStep("card");
    })();

    return () => {
      cancelled = true;
    };
  }, [hydrated, sessionReady, needsSignIn, router, next, fresh]);

  if (step === "gate") return <TrialGate onContinue={() => setStep("card")} />;
  if (step !== "card") return <div className="h-lvh bg-background" aria-hidden />;
  return <LandingPage next={next} fresh={fresh} />;
}

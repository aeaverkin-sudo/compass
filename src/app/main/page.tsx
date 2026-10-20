"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MainScreen } from "@main/components/main-screen";
import { ConsentRefresh } from "@/shared/components/consent-refresh";
import { useCardsHydrated } from "@/shared/hooks/use-cards-hydrated";
import { createBrowserSupabaseClient } from "@/shared/lib/supabase/browser";
import { useRegistrationRequired, useSessionBootstrap } from "@/shared/hooks/use-session-bootstrap";
import { useStoreHydrated } from "@/shared/hooks/use-store-hydrated";
import { sourceCardToken } from "@/shared/services/source-card";
import { useAppStore } from "@/shared/store/app-store";

function applyMainChrome() {
  document.documentElement.classList.add("compass-ready");

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute("content", "#c5e8f7");
  }
}

export default function MainPage() {
  const router = useRouter();
  const source = typeof window === "undefined" ? null : sourceCardToken(new URLSearchParams(window.location.search).get("card"));
  const hydrated = useStoreHydrated();
  const sessionReady = useSessionBootstrap();
  const needsSignIn = useRegistrationRequired();
  const cardsReady = useCardsHydrated();
  const onboarded = useAppStore((state) => state.user.onboarded);
  const hasCards = useAppStore((state) => state.cards.length > 0);
  const ownerId = useAppStore((state) => state.ownerId);
  const portfolio = useAppStore((state) =>
    state.cards.some((card) => card.displayName.trim() || card.photoAttachmentId || card.photo),
  );
  // A returning device draws its stored cards at once; the session check and the server pull catch up behind.
  const cached = hydrated && onboarded && hasCards && portfolio && !needsSignIn && Boolean(ownerId);
  const [openEmpty, setOpenEmpty] = useState(false);

  useEffect(() => {
    applyMainChrome();
  }, []);

  useEffect(() => {
    if (!hydrated || !sessionReady) return;
    let cancel = false;
    void createBrowserSupabaseClient()
      .auth.getUser()
      .then(({ data }) => {
        if (cancel) return;
        if (!data.user || data.user.is_anonymous) {
          router.replace(source ? `/register?signin=1&card=${encodeURIComponent(source)}` : "/register?signin=1");
        }
      })
      .catch(() => undefined);
    if (needsSignIn) {
      router.replace(source ? `/register?signin=1&expired=1&card=${encodeURIComponent(source)}` : "/register?signin=1&expired=1");
      return () => {
        cancel = true;
      };
    }
    if (!cardsReady) {
      return () => {
        cancel = true;
      };
    }
    if (source && portfolio) {
      router.replace(`/save/${encodeURIComponent(source)}`);
      return () => {
        cancel = true;
      };
    }
    if (!onboarded && !source) {
      router.replace("/");
      return () => {
        cancel = true;
      };
    }
    if (portfolio) {
      return () => {
        cancel = true;
      };
    }
    void createBrowserSupabaseClient()
      .auth.getUser()
      .then(({ data }) => {
        if (cancel) return;
        const user = data.user;
        if (!user || user.is_anonymous) {
          if (source) router.replace(`/register?card=${encodeURIComponent(source)}`);
          else setOpenEmpty(true);
          return;
        }
        router.replace(source ? `/create?card=${encodeURIComponent(source)}` : "/create");
      })
      .catch(() => {
        if (!cancel) setOpenEmpty(true);
      });
    return () => {
      cancel = true;
    };
  }, [hydrated, sessionReady, needsSignIn, cardsReady, onboarded, portfolio, source, router]);

  const holdEmpty = !portfolio && cardsReady && (onboarded || Boolean(source)) && !needsSignIn && !openEmpty;
  const pendingSave = Boolean(source && portfolio);

  if (pendingSave || (!cached && (!hydrated || !sessionReady || needsSignIn || !cardsReady || (!onboarded && !source) || holdEmpty))) {
    return <div className="compass-main fixed inset-y-0 bg-background" aria-hidden />;
  }

  return (
    <>
      <MainScreen />
      <ConsentRefresh />
    </>
  );
}

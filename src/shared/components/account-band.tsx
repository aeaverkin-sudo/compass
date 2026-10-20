"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { TabBand } from "@main/components/tab-band";
import { AdedWordmark } from "@/shared/components/aded-wordmark";
import { TapButton } from "@/shared/components/tap-button";
import { useSessionBootstrap } from "@/shared/hooks/use-session-bootstrap";
import { createBrowserSupabaseClient } from "@/shared/lib/supabase/browser";
import { cn } from "@/lib/utils";

const DOOR =
  "press touch-manipulation flex h-full min-h-11 w-full items-center uppercase [-webkit-tap-highlight-color:transparent]";

function subscribe() {
  return () => {};
}

function originNow() {
  return window.location.origin;
}

function originOnServer() {
  return "";
}

/** Absolute on the client, so a PDF link annotation opens anywhere. */
function useOrigin() {
  return useSyncExternalStore(subscribe, originNow, originOnServer);
}

/** A session, including a trial. Null until the first auth check finishes. */
function useHasSession() {
  const ready = useSessionBootstrap();
  const [has, setHas] = useState<boolean | null>(null);
  useEffect(() => {
    if (!ready) return;
    const supabase = createBrowserSupabaseClient();
    let cancel = false;
    void supabase.auth.getUser().then(({ data }) => {
      if (!cancel) setHas(Boolean(data.user));
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setHas(Boolean(session?.user));
    });
    return () => {
      cancel = true;
      data.subscription.unsubscribe();
    };
  }, [ready]);
  return ready ? has : null;
}

/**
 * Two doors under the portfolio name. The web plaque is the main TabBand.
 * The painted PDF keeps its own row.
 */
export function AccountBand({
  token,
  pdf = false,
  inset,
  onPdf,
  onPreparePdf,
}: {
  token: string;
  /** Painted PDF carries the ADED mark. The web plaque keeps Save PDF file. */
  pdf?: boolean;
  /** PDF row pad. */
  inset?: number;
  /** Web door. The painted PDF keeps its own right-hand link. */
  onPdf?: () => void;
  onPreparePdf?: () => void;
}) {
  const origin = useOrigin();
  const hasSession = useHasSession();
  const saveHref = `${origin}/save/${encodeURIComponent(token)}`;
  const cardHref = `${origin}/c/${encodeURIComponent(token)}`;
  const signUpHref = `/register?card=${encodeURIComponent(token)}`;
  const signInHref = `/register?signin=1&card=${encodeURIComponent(token)}`;
  if (!pdf) {
    return (
      <TabBand
        pin
        inset="calc(clamp(24px, 6.1vw, 28px) - 3mm)"
        label="Account"
        left={
          hasSession === null ? (
            <span className="flex-1" />
          ) : hasSession ? (
            <a href={saveHref} className={DOOR}>
              <span>Add to My Network</span>
            </a>
          ) : (
            <span className="flex h-full w-full flex-col justify-center">
              <a href={signUpHref} className="press touch-manipulation leading-none t-band [-webkit-tap-highlight-color:transparent]">
                Sign up
              </a>
              <a
                href={signInHref}
                className="press mt-1 w-fit touch-manipulation leading-none t-meta normal-case underline decoration-[0.5px] underline-offset-[3px] [-webkit-tap-highlight-color:transparent]"
              >
                Sign in
              </a>
            </span>
          )
        }
        right={
          <TapButton
            onPrepare={onPreparePdf}
            onTap={() => onPdf?.()}
            className={cn(DOOR, "justify-end border-0 bg-transparent")}
          >
            <span data-pdf-link="">Save PDF file</span>
          </TapButton>
        }
      />
    );
  }
  const pdfDoor =
    "press t-band leading-[1.45] flex min-h-11 flex-1 touch-manipulation items-center py-3 [-webkit-tap-highlight-color:transparent]";
  return (
    <nav
      aria-label="Account"
      className={cn("bg-sky text-[var(--ink)]", inset == null && "px-[calc(clamp(24px,6.1vw,28px)-3mm)]")}
      style={{
        paddingLeft: inset,
        paddingRight: inset,
      }}
    >
      <div className="flex min-h-11 items-stretch">
        <a href={cardHref} className={cn(pdfDoor, "text-left")}>
          <span data-pdf-link="" className="inline-block w-fit">
            Add to My
            <br />
            Network
          </span>
        </a>
        <span className="flex flex-1 items-center justify-end">
          <AdedWordmark variant="mesh" className="block h-[calc(14px*1.45*2)] w-auto" />
        </span>
      </div>
    </nav>
  );
}

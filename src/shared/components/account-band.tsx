"use client";

import { useSyncExternalStore } from "react";
import { TabBand } from "@main/components/tab-band";
import { AdedWordmark } from "@/shared/components/aded-wordmark";
import { TapButton } from "@/shared/components/tap-button";
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
  const saveHref = `${origin}/save/${encodeURIComponent(token)}`;
  if (!pdf) {
    return (
      <TabBand
        inset="calc(clamp(24px, 6.1vw, 28px) - 3mm)"
        label="Account"
        left={
          <a href={saveHref} className={DOOR}>
            <span data-pdf-link="">Add to My Network</span>
          </a>
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
        <a href={saveHref} className={cn(pdfDoor, "text-left")}>
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

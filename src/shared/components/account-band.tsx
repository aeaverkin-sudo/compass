"use client";

import { useSyncExternalStore } from "react";
import { TabBand } from "@main/components/tab-band";
import { AdedWordmark } from "@/shared/components/aded-wordmark";
import { cn } from "@/lib/utils";

const FONT = '"Helvetica Neue", Helvetica, Arial, sans-serif';
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
  inset,
  safe = true,
  medium,
  onPdf,
  onPreparePdf,
}: {
  token: string;
  inset?: number;
  safe?: boolean;
  /** Painted PDF carries the ADED mark. The web plaque keeps Get PDF file. */
  medium?: "web" | "pdf";
  /** Web door. The painted PDF keeps its own right-hand link. */
  onPdf?: () => void;
  onPreparePdf?: () => void;
}) {
  const origin = useOrigin();
  const pdf = medium === "pdf" || (medium == null && !safe);
  const saveHref = `${origin}/save/${encodeURIComponent(token)}`;
  if (!pdf) {
    return (
      <TabBand
        safeBottom
        label="Account"
        left={
          <a href={saveHref} className={DOOR}>
            <span data-pdf-link="">Save to network</span>
          </a>
        }
        right={
          <button
            type="button"
            onPointerDown={onPreparePdf}
            onClick={onPdf}
            className={cn(DOOR, "justify-end border-0 bg-transparent")}
          >
            <span data-pdf-link="">Get PDF file</span>
          </button>
        }
      />
    );
  }
  const pdfDoor =
    "press t-caps flex min-h-11 flex-1 touch-manipulation items-center py-3 text-[#111] [-webkit-tap-highlight-color:transparent]";
  return (
    <nav
      aria-label="Account"
      className={cn("bg-sky text-[var(--ink)]", inset == null && "px-[calc(clamp(24px,6.1vw,28px)-3mm)]")}
      style={{
        fontFamily: FONT,
        paddingLeft: inset,
        paddingRight: inset,
      }}
    >
      <div className="flex min-h-11 items-stretch">
        <a href={saveHref} className={cn(pdfDoor, "text-left")}>
          <span data-pdf-link="" className="inline-block w-fit">
            Save to
            <br />
            network
          </span>
        </a>
        <span className="flex flex-1 items-center justify-end">
          <AdedWordmark color="#111" className="block h-[calc(13px*1.45*2)] w-auto" />
        </span>
      </div>
    </nav>
  );
}

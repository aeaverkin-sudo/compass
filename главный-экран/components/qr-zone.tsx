"use client";

import { useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { cn } from "@/lib/utils";
import { subscribeLiveQrPulse } from "@/shared/lib/live-qr-pulse";
import { useAppStore } from "@/shared/store/app-store";
import { QR_COLOR, BROWSE_QR_SIZE, layoutTop } from "../layout";

type QrZoneProps = {
  url: string;
  visible: boolean;
  topOffsetPx: number;
  sheetIndex?: number;
  sheetTotal?: number;
  counterRightCss?: string;
};

/** Only the QR on the screen carries this. A shared link and a printed sheet do not. */
function liveQrUrl(url: string) {
  if (!url || /(?:\?|&)(?:src|via)=qr(?:&|$)/.test(url)) return url;
  return `${url}${url.includes("?") ? "&" : "?"}src=qr`;
}

export function QrZone({ url, visible, topOffsetPx, sheetIndex, sheetTotal, counterRightCss }: QrZoneProps) {
  const currentCardId = useAppStore((state) => state.cards[state.currentCardIndex]?.id ?? "");
  const monochrome = useAppStore((state) => state.user.monochrome);
  const [breathe, setBreathe] = useState(false);
  const playingRef = useRef(false);

  useEffect(() => {
    return subscribeLiveQrPulse((cardId) => {
      if (!visible || cardId !== currentCardId) return;
      if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        return;
      }
      // One breath per batch: ignore while the current pass is still running.
      if (playingRef.current) return;
      playingRef.current = true;
      setBreathe(true);
    });
  }, [currentCardId, visible]);

  return (
    <div
      className="pointer-events-none absolute inset-x-0 flex justify-center"
      style={{ top: layoutTop(topOffsetPx), height: BROWSE_QR_SIZE }}
      aria-hidden={!visible}
    >
      {sheetIndex && sheetTotal ? (
        <p
          className="pointer-events-none absolute m-0 text-right t-label"
          style={{ bottom: 2, right: counterRightCss, marginRight: "calc(-0.1em - 0.5px)", lineHeight: 1 }}
        >
          {sheetIndex}/{sheetTotal}
        </p>
      ) : null}
      {visible ? (
        <div
          className={cn(breathe && "compass-qr-breathe")}
          onAnimationEnd={() => {
            playingRef.current = false;
            setBreathe(false);
          }}
        >
          <QRCodeSVG
            value={liveQrUrl(url)}
            size={BROWSE_QR_SIZE}
            level="H"
            fgColor={monochrome ? "#000000" : QR_COLOR}
            bgColor="#FFFFFF"
          />
        </div>
      ) : null}
    </div>
  );
}

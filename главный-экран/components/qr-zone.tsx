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
};

export function QrZone({ url, visible, topOffsetPx }: QrZoneProps) {
  const currentCardId = useAppStore((state) => state.cards[state.currentCardIndex]?.id ?? "");
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
      {visible ? (
        <div
          className={cn(breathe && "compass-qr-breathe")}
          onAnimationEnd={() => {
            playingRef.current = false;
            setBreathe(false);
          }}
        >
          <QRCodeSVG
            value={url}
            size={BROWSE_QR_SIZE}
            level="H"
            fgColor={QR_COLOR}
            bgColor="#FFFFFF"
          />
        </div>
      ) : null}
    </div>
  );
}

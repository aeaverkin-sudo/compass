"use client";

import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";

interface QrZoneProps {
  url: string;
  visible: boolean;
  flashKey: number;
  /** Distance from the top of the screen, excluding the safe area. */
  top: number;
  size: number;
}

const PLATE_PADDING = 6;

export function QrZone({ url, visible, flashKey, top, size }: QrZoneProps) {
  const [flashing, setFlashing] = useState(false);

  useEffect(() => {
    if (!visible || flashKey === 0) return;
    setFlashing(true);
    const t = setTimeout(() => setFlashing(false), 400);
    return () => clearTimeout(t);
  }, [flashKey, visible]);

  return (
    <div
      className="pointer-events-none absolute inset-x-0 z-0 flex justify-center"
      style={{ top: `calc(env(safe-area-inset-top) + ${top}px)` }}
      aria-hidden={!visible}
    >
      <div className="relative" style={{ width: size, height: size }}>
        <div
          className="absolute -inset-6 rounded-[32px]"
          style={{
            background:
              "radial-gradient(circle at center, oklch(64% 0.19 45 / 0.2) 0%, oklch(64% 0.19 45 / 0) 70%)",
            filter: "blur(6px)",
          }}
        />
        <div
          className={`relative flex h-full w-full items-center justify-center rounded-[12px] ${
            flashing ? "qr-flash" : ""
          }`}
          style={{ background: "var(--qr-plate)", padding: PLATE_PADDING }}
        >
          {visible && (
            <QRCodeSVG
              value={url}
              size={size - PLATE_PADDING * 2}
              level="M"
              fgColor="#C1571F"
              bgColor="transparent"
            />
          )}
        </div>
      </div>
    </div>
  );
}

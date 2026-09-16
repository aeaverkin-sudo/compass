"use client";

import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";

interface QrZoneProps {
  url: string;
  visible: boolean;
  flashKey: number;
}

export function QrZone({ url, visible, flashKey }: QrZoneProps) {
  const [flashing, setFlashing] = useState(false);

  useEffect(() => {
    if (!visible || flashKey === 0) return;
    setFlashing(true);
    const t = setTimeout(() => setFlashing(false), 400);
    return () => clearTimeout(t);
  }, [flashKey, visible]);

  return (
    <div
      className="pointer-events-none absolute inset-x-0 top-0 z-0 flex justify-center"
      style={{ paddingTop: "calc(7vh + env(safe-area-inset-top))" }}
      aria-hidden={!visible}
    >
      <div className="relative">
        <div
          className="absolute -inset-8 rounded-full opacity-60 blur-2xl"
          style={{
            background:
              "radial-gradient(circle, rgba(232,93,4,0.16) 0%, rgba(232,93,4,0) 70%)",
          }}
        />
        {visible ? (
          <div className={`relative ${flashing ? "qr-flash" : ""}`}>
            <QRCodeSVG
              value={url}
              size={184}
              level="M"
              fgColor="#E85D04"
              bgColor="transparent"
            />
          </div>
        ) : (
          <div style={{ height: 184, width: 184 }} />
        )}
      </div>
    </div>
  );
}

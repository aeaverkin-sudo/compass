"use client";

import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";

interface PortfolioQRProps {
  url: string;
  visible: boolean;
  flashKey: number;
}

export function PortfolioQR({ url, visible, flashKey }: PortfolioQRProps) {
  const [flashing, setFlashing] = useState(false);

  useEffect(() => {
    if (!visible || flashKey === 0) return;
    setFlashing(true);
    const t = setTimeout(() => setFlashing(false), 400);
    return () => clearTimeout(t);
  }, [flashKey, visible]);

  if (!visible) {
    return <div className="h-[200px]" aria-hidden />;
  }

  return (
    <div className="flex h-[200px] items-center justify-center">
      <div
        className={`relative transition-opacity duration-300 ${flashing ? "qr-flash" : ""}`}
      >
        <QRCodeSVG
          value={url}
          size={168}
          level="M"
          fgColor="#E85D04"
          bgColor="transparent"
        />
      </div>
    </div>
  );
}

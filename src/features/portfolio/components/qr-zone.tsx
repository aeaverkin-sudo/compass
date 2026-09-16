"use client";

import { useEffect, useState } from "react";
import { Share, MoreHorizontal } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";

interface QrZoneProps {
  url: string;
  visible: boolean;
  flashKey: number;
  onShare: () => void;
  shareReady: boolean;
  compact?: boolean;
}

export function QrZone({ url, visible, flashKey, onShare, shareReady, compact }: QrZoneProps) {
  const [flashing, setFlashing] = useState(false);
  const qrSize = compact ? 100 : 168;

  useEffect(() => {
    if (!visible || flashKey === 0) return;
    setFlashing(true);
    const t = setTimeout(() => setFlashing(false), 400);
    return () => clearTimeout(t);
  }, [flashKey, visible]);

  return (
    <div
      className={`relative shrink-0 px-4 transition-all duration-300 ${
        compact ? "pt-2 pb-0" : "pt-3 pb-2"
      }`}
      style={{ minHeight: compact ? "18vh" : "30vh" }}
    >
      <div className="flex items-start justify-between">
        <button
          type="button"
          onClick={onShare}
          disabled={!shareReady}
          className="p-1 text-[#1a1a1a] disabled:opacity-30"
          aria-label="Share card"
        >
          <Share size={20} strokeWidth={1.5} />
        </button>
        <button type="button" className="p-1 text-[#1a1a1a]/60" aria-label="More">
          <MoreHorizontal size={20} strokeWidth={1.5} />
        </button>
      </div>

      <div className="flex flex-col items-center justify-center">
        {visible ? (
          <div className={`transition-all duration-300 ${flashing ? "qr-flash" : ""}`}>
            <QRCodeSVG
              value={url}
              size={qrSize}
              level="M"
              fgColor="#E85D04"
              bgColor="transparent"
            />
          </div>
        ) : (
          <div style={{ height: qrSize }} aria-hidden />
        )}
        {visible && !compact && (
          <p className="mt-2 text-[11px] text-[#999]">Scan to get my contact</p>
        )}
      </div>
    </div>
  );
}

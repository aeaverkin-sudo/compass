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
}

export function QrZone({ url, visible, flashKey, onShare, shareReady }: QrZoneProps) {
  const [flashing, setFlashing] = useState(false);

  useEffect(() => {
    if (!visible || flashKey === 0) return;
    setFlashing(true);
    const t = setTimeout(() => setFlashing(false), 400);
    return () => clearTimeout(t);
  }, [flashKey, visible]);

  return (
    <div className="relative shrink-0 px-4 pt-3 pb-2">
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

      <div className="flex flex-col items-center">
        {visible ? (
          <div className={`transition-opacity duration-300 ${flashing ? "qr-flash" : ""}`}>
            <QRCodeSVG value={url} size={140} level="M" fgColor="#E85D04" bgColor="transparent" />
          </div>
        ) : (
          <div className="h-[140px]" aria-hidden />
        )}
        {visible && (
          <p className="mt-1 text-[11px] text-[#999]">Scan to get my contact</p>
        )}
      </div>
    </div>
  );
}

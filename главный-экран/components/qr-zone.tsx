"use client";

import { QRCodeSVG } from "qrcode.react";
import { QR_COLOR, QR_SIZE, layoutTop } from "../layout";

type QrZoneProps = {
  url: string;
  visible: boolean;
  topOffsetPx: number;
};

export function QrZone({ url, visible, topOffsetPx }: QrZoneProps) {
  return (
    <div
      className="pointer-events-none absolute inset-x-0 flex justify-center"
      style={{ top: layoutTop(topOffsetPx), height: QR_SIZE }}
      aria-hidden={!visible}
    >
      {visible ? (
        <QRCodeSVG
          value={url}
          size={QR_SIZE}
          level="M"
          fgColor={QR_COLOR}
          bgColor="#FFFFFF"
        />
      ) : null}
    </div>
  );
}

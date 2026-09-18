"use client";

import { QRCodeSVG } from "qrcode.react";
import { QR_SIZE } from "../layout";

type QrZoneProps = {
  url: string;
  visible: boolean;
  top: number;
};

const QR_COLOR = "#C1571F";
const PLATE_PADDING = 6;

export function QrZone({ url, visible, top }: QrZoneProps) {
  const codeSize = QR_SIZE - PLATE_PADDING * 2;

  return (
    <div
      className="pointer-events-none absolute inset-x-0 flex justify-center"
      style={{ top }}
      aria-hidden={!visible}
    >
      <div className="relative flex items-center justify-center" style={{ width: QR_SIZE, height: QR_SIZE }}>
        <div
          className="absolute -inset-4 rounded-[28px]"
          style={{
            background:
              "radial-gradient(circle at center, oklch(64% 0.19 45 / 0.18) 0%, oklch(64% 0.19 45 / 0) 72%)",
            filter: "blur(5px)",
          }}
        />
        <div
          className="relative flex h-full w-full items-center justify-center rounded-[12px]"
          style={{ background: "var(--qr-plate)", padding: PLATE_PADDING }}
        >
          {visible ? (
            <QRCodeSVG
              value={url}
              size={codeSize}
              level="M"
              fgColor={QR_COLOR}
              bgColor="transparent"
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

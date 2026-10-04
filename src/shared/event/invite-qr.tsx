"use client";

import { QRCodeSVG } from "qrcode.react";
import { QR_COLOR, QR_SIZE } from "@main/layout";
import { eventThemeById, type EventThemeId } from "@/shared/event/themes";

const MIN_QR = 46;
/** White square the generator punches out so modules do not show through the frame. */
const PLATE =
  "data:image/svg+xml," +
  encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="#ffffff"/></svg>');

type InviteQrProps = {
  url: string;
  /** Drawn size in px. The check-in badge keeps the shared orange QR when this is omitted. */
  size?: number;
  /** Cover colour. Dark covers sit the code on a white plate so a camera can read it. */
  themeId?: EventThemeId;
  /** Centre mark. Drawn in a framed white plate, never larger than about 15% of the code. */
  logoUrl?: string | null;
};

/** Outer side of the framed plate. Its area stays within 15% of the QR. */
export function logoPlateSide(qrPx: number) {
  return Math.floor(qrPx * Math.sqrt(0.15));
}

/** Invite QR. Light covers use the theme ground. Noir and blue use a white plate. */
export function InviteQr({ url, size = QR_SIZE, themeId, logoUrl }: InviteQrProps) {
  const px = Math.max(MIN_QR, size);
  const logo = logoUrl?.trim() || null;
  const plate = logo ? logoPlateSide(px) : 0;
  const code = (
    <QRCodeSVG
      value={url}
      size={px}
      level={logo ? "H" : "M"}
      fgColor={!themeId ? QR_COLOR : "#111111"}
      bgColor={!themeId || eventThemeById(themeId).dark ? "#ffffff" : eventThemeById(themeId).ground}
      marginSize={!themeId ? 0 : eventThemeById(themeId).dark ? 2 : 0}
      imageSettings={logo ? { src: PLATE, width: plate, height: plate, excavate: true } : undefined}
    />
  );
  if (!logo) return code;
  return (
    <span className="relative inline-block" style={{ width: px, height: px }}>
      {code}
      <span
        className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
        style={{
          boxSizing: "border-box",
          width: plate,
          height: plate,
          border: "1px solid #111111",
          padding: 3,
          background: "#ffffff",
        }}
      >
        <span
          className="flex h-full w-full items-center justify-center"
          style={{
            boxSizing: "border-box",
            border: "1px solid #111111",
            borderRadius: 2,
            background: "#ffffff",
            padding: 2,
          }}
        >
          <img src={logo} alt="" className="block h-full w-full object-contain" style={{ borderRadius: 2 }} />
        </span>
      </span>
    </span>
  );
}

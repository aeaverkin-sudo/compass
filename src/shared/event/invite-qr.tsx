"use client";

import { QRCodeSVG } from "qrcode.react";
import { QR_COLOR, QR_SIZE } from "@main/layout";

const MIN_QR = 46;

/** Check-in mark on a guest badge. The organiser scans this. Invites do not carry a QR. */
export function InviteQr({ url, size = QR_SIZE }: { url: string; size?: number }) {
  const px = Math.max(MIN_QR, size);
  return <QRCodeSVG value={url} size={px} level="M" fgColor={QR_COLOR} bgColor="#ffffff" />;
}

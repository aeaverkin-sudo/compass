"use client";

import { QRCodeSVG } from "qrcode.react";
import { QR_COLOR, QR_SIZE } from "@main/layout";

/** Invite QR. White ground so it scans on every cover, including Noir. */
export function InviteQr({ url }: { url: string }) {
  return <QRCodeSVG value={url} size={QR_SIZE} level="M" fgColor={QR_COLOR} bgColor="#ffffff" />;
}

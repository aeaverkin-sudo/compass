"use client";

import { QRCodeSVG } from "qrcode.react";
import { QR_COLOR, QR_SIZE } from "@main/layout";
import { eventThemeById, type EventThemeId } from "@/shared/event/themes";

const MIN_QR = 46;

type InviteQrProps = {
  url: string;
  /** Drawn size in px. The check-in badge keeps the shared orange QR when this is omitted. */
  size?: number;
  /** Cover colour. Dark covers sit the code on a white plate so a camera can read it. */
  themeId?: EventThemeId;
};

/** Invite QR. Light covers use the theme ground. Noir and cobalt use a white plate. */
export function InviteQr({ url, size = QR_SIZE, themeId }: InviteQrProps) {
  const px = Math.max(MIN_QR, size);
  if (!themeId) {
    return <QRCodeSVG value={url} size={px} level="M" fgColor={QR_COLOR} bgColor="#ffffff" />;
  }
  const theme = eventThemeById(themeId);
  if (theme.dark) {
    return <QRCodeSVG value={url} size={px} level="M" fgColor="#111111" bgColor="#ffffff" marginSize={2} />;
  }
  return <QRCodeSVG value={url} size={px} level="M" fgColor="#111111" bgColor={theme.ground} marginSize={0} />;
}

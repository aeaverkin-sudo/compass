"use client";

import type { ReactNode } from "react";
import { ScanButton } from "@/shared/components/scan-icon";
import { CardShareControl, useCardShare } from "@/shared/components/card-share-control";
import { getNextScanAddons } from "@/shared/services/card-snapshot";
import { useAppStore } from "@/shared/store/app-store";
import type { Card } from "@/shared/types";
import { BROWSE_QR_SIZE, layoutTop } from "../layout";
import { NextScanMenu } from "./next-scan-menu";

/** Visible mark heights. The size-11 tap sits on each mark and does not enter the column. */
const SHARE_PX = 16.1;
const SCAN_PX = 16.1;
const PLUS_PX = 18;
const COUNT_PX = 11;

function RailMark({ height, children }: { height: number; children?: ReactNode }) {
  return (
    <div className="relative w-full shrink-0" style={{ height }}>
      {children != null ? (
        <div className="pointer-events-auto absolute top-1/2 left-1/2 flex size-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center">
          {children}
        </div>
      ) : null}
    </div>
  );
}

export function SideRail({
  qrTop,
  counterRightCss,
  card,
  index,
  total,
  showPlus,
  frozen,
}: {
  qrTop: number;
  counterRightCss: string;
  card: Card;
  index: number;
  total: number;
  showPlus: boolean;
  frozen: boolean;
}) {
  const updateCard = useAppStore((state) => state.updateCard);
  const share = useCardShare(card);
  const canShare = Boolean(card.publicToken) && !frozen;

  return (
    <div
      className="pointer-events-none absolute z-30 flex flex-col items-center justify-between"
      style={{ top: layoutTop(qrTop), height: BROWSE_QR_SIZE, right: 0, width: counterRightCss }}
    >
      <RailMark height={SHARE_PX}>
        <CardShareControl
          card={card}
          onShare={canShare ? share.handleShare : undefined}
          onPrepareShare={canShare ? share.primeShare : undefined}
        />
      </RailMark>
      <RailMark height={SCAN_PX}>
        <ScanButton className="justify-center" />
      </RailMark>
      <RailMark height={PLUS_PX}>
        {showPlus ? (
          <NextScanMenu
            bare
            addons={getNextScanAddons(card)}
            onSetAddons={(addons) => updateCard(card.id, { nextScanAddons: addons })}
          />
        ) : null}
      </RailMark>
      <RailMark height={COUNT_PX}>
        <p className="t-label text-[var(--grey)]" style={{ lineHeight: 1 }}>
          {index}/{total}
        </p>
      </RailMark>
    </div>
  );
}

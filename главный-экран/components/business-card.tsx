"use client";

import { forwardRef, useCallback, useLayoutEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { Share } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Card, ContactItem } from "@/shared/types";
import { useAppStore } from "@/shared/store/app-store";
import { PhotoSlotPicker } from "@landing/components/photo-slot-picker";
import { CardNameField } from "./card-name-field";
import { getCardItems, getNextScanAddons } from "@/shared/services/card-snapshot";
import { composeCard } from "@/shared/services/card-zones";
import { ContactItemChipList } from "./contact-item-chip";
import { NextScanMenu } from "./next-scan-menu";
import { browseCardHeight, CARD_HEADER_NAME_SIZE_PX, type MainScreenMode } from "../layout";

const HERO_PHOTO_PX = 105;

function heroLineSize(lines: string[], width: number, height: number) {
  if (!width || !height) return 58;
  const probe = document.createElement("span");
  probe.style.cssText =
    "position:absolute;visibility:hidden;white-space:nowrap;font-weight:300;letter-spacing:-0.045em;line-height:0.88;font-family:\"Helvetica Neue\",Helvetica,Arial,sans-serif";
  document.body.appendChild(probe);
  const shown = lines.filter((line) => line.trim().length > 0);
  const count = Math.max(shown.length, 1);
  let lo = 16;
  let hi = 58;
  let best = 16;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    probe.style.fontSize = `${mid}px`;
    const tooWide = shown.some((line) => {
      probe.textContent = line;
      return probe.offsetWidth > width;
    });
    const tooTall = count * mid * 0.88 > height;
    if (tooWide || tooTall) hi = mid - 1;
    else {
      best = mid;
      lo = mid + 1;
    }
  }
  probe.remove();
  return best;
}

function capInset(size: number) {
  if (typeof document === "undefined") return 0;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return 0;
  ctx.font = `300 ${size}px "Helvetica Neue", Helvetica, Arial, sans-serif`;
  const metrics = ctx.measureText("A");
  const ink = metrics.actualBoundingBoxAscent + (metrics.actualBoundingBoxDescent || 0);
  return ((size * 0.88) - ink) / 2;
}

function HeroName({
  first,
  second,
  onChange,
}: {
  first: string;
  second: string;
  onChange?: (displayName: string) => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(58);

  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const fit = () => setSize(heroLineSize([first, second], box.clientWidth, Math.max(box.clientHeight - 8, 16)));
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(box);
    return () => observer.disconnect();
  }, [first, second]);

  const lineClass =
    "block w-full overflow-hidden bg-transparent whitespace-nowrap text-left leading-[0.88] font-light tracking-[-0.045em] text-[#111] outline-none";
  const lift = capInset(size);

  return (
    <div ref={boxRef} data-card-content className="flex h-full min-w-0 flex-col items-start justify-between">
      {onChange ? (
        <>
          <input
            value={first}
            onChange={(event) => onChange([event.target.value, second].filter(Boolean).join(" "))}
            onClick={(event) => event.stopPropagation()}
            className={cn("compass-input", lineClass)}
            style={{ fontSize: size, marginTop: -lift }}
          />
          <input
            value={second}
            onChange={(event) => onChange([first, event.target.value].filter(Boolean).join(" "))}
            onClick={(event) => event.stopPropagation()}
            className={cn("compass-input", lineClass)}
            style={{ fontSize: size }}
          />
        </>
      ) : (
        <>
          <span className={lineClass} style={{ fontSize: size, marginTop: -lift }}>{first}</span>
          {second ? <span className={lineClass} style={{ fontSize: size }}>{second}</span> : null}
        </>
      )}
    </div>
  );
}

function splitHeroName(name: string) {
  const trimmed = name.trim();
  const space = trimmed.indexOf(" ");
  if (space < 0) return [trimmed, ""] as const;
  return [trimmed.slice(0, space), trimmed.slice(space + 1)] as const;
}

function EditorialHeader({
  card,
  positionTitle,
  showPlus,
  nextScan,
  onPhotoChange,
  onDisplayNameChange,
}: {
  card: Card;
  positionTitle?: string;
  showPlus: boolean;
  nextScan: ReactNode;
  onPhotoChange?: (photo: string | null) => void;
  onDisplayNameChange?: (displayName: string) => void;
}) {
  const [first, second] = splitHeroName(card.displayName);

  return (
    <div className="w-full">
      <div className="border-t-[0.5px] border-[#111]" />
      <div className="relative py-[22px]">
        <div className="flex items-stretch gap-3" style={{ height: HERO_PHOTO_PX }}>
          <div className="min-w-0 flex-1">
            <HeroName first={first} second={second} onChange={onDisplayNameChange} />
          </div>
          {onPhotoChange ? (
            <PhotoSlotPicker photo={card.photo ?? null} onPhotoChange={onPhotoChange} sizePx={HERO_PHOTO_PX} borderRadiusPx={0} />
          ) : card.photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img data-card-content src={card.photo} alt="" className="size-[105px] shrink-0 object-cover" />
          ) : null}
          {showPlus ? <div className="ml-1 shrink-0 self-start">{nextScan}</div> : null}
        </div>
        {positionTitle ? (
          <p data-card-content className="mt-3 text-[15px] leading-none font-light tracking-[0.1em] uppercase">
            {positionTitle}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function CompactHeader({
  card,
  positionTitle,
  positionCompany,
  onDisplayNameChange,
}: {
  card: Card;
  positionTitle?: string;
  positionCompany?: string;
  onDisplayNameChange?: (displayName: string) => void;
}) {
  return (
    <div className="flex w-full shrink-0 flex-col items-center">
      <div className="w-full text-center">
        {onDisplayNameChange ? (
          <CardNameField value={card.displayName} onChange={onDisplayNameChange} fontSizePx={CARD_HEADER_NAME_SIZE_PX} />
        ) : (
          <p data-card-content className="compass-type-name text-foreground" style={{ fontSize: CARD_HEADER_NAME_SIZE_PX }}>
            {card.displayName}
          </p>
        )}
        {positionTitle ? (
          <p data-card-content className="compass-type-position mt-1 text-center text-foreground">
            {positionTitle}
            {positionCompany ? <span className="text-label"> · {positionCompany}</span> : null}
          </p>
        ) : null}
      </div>
    </div>
  );
}

type BusinessCardProps = {
  card: Card;
  library: ContactItem[];
  mode: MainScreenMode;
  libraryCardHeightPx?: number;
  onEmptyAreaTap: () => void;
  onPhotoChange?: (photo: string | null) => void;
  onDisplayNameChange?: (displayName: string) => void;
  onCardUpdate?: (data: Partial<Card>) => void;
};

export const BusinessCard = forwardRef<HTMLElement, BusinessCardProps>(function BusinessCard(
  {
    card,
    library,
    mode,
    libraryCardHeightPx,
    onEmptyAreaTap,
    onPhotoChange,
    onDisplayNameChange,
    onCardUpdate,
  },
  ref,
) {
  const setCardItemOrder = useAppStore((state) => state.setCardItemOrder);
  const shareToken = useAppStore((state) => state.user.shareToken);
  const items = getCardItems(card, library);
  const position = composeCard(items).position;
  const compact = mode === "library";
  const nextScanAddons = getNextScanAddons(card);
  const articleRef = useRef<HTMLElement | null>(null);
  const [scrolledUnderQr, setScrolledUnderQr] = useState(false);

  const handleCommitOrder = useCallback(
    (orderedIds: string[]) => {
      setCardItemOrder(card.id, orderedIds);
    },
    [card.id, setCardItemOrder],
  );

  const handleClick = (event: MouseEvent<HTMLElement>) => {
    if ((event.target as HTMLElement).closest("[data-card-content]")) return;
    onEmptyAreaTap();
  };

  return (
    <article
      ref={(node) => {
        articleRef.current = node;
        if (typeof ref === "function") ref(node);
        else if (ref) ref.current = node;
      }}
      onClick={handleClick}
      className={cn(
        "compass-layer flex w-full cursor-default flex-col",
        compact
          ? "compass-card compass-card-library min-h-0 items-center justify-start px-5 pb-3 transition-[transform,box-shadow,height] duration-[460ms] ease-out"
          : "relative min-h-0 overflow-hidden bg-white text-[#111]",
      )}
      style={
        compact
          ? {
              height: libraryCardHeightPx,
              paddingTop: 16,
            }
          : {
              height: browseCardHeight(),
            }
      }
    >
      <div
        className={cn("flex min-h-0 flex-1 flex-col", !compact && "overflow-y-auto px-[calc(clamp(24px,6.1vw,28px)-1mm)] pb-8")}
        onScroll={
          compact
            ? undefined
            : (event) => setScrolledUnderQr(event.currentTarget.scrollTop > 2)
        }
      >
      {compact ? (
        <CompactHeader
          card={card}
          positionTitle={position?.title}
          positionCompany={position?.company}
          onDisplayNameChange={onDisplayNameChange}
        />
      ) : (
        <EditorialHeader
          card={card}
          positionTitle={position?.title}
          showPlus={Boolean(onCardUpdate && card.displayName.trim() && card.photo)}
          nextScan={
            onCardUpdate && card.displayName.trim() && card.photo ? (
              <NextScanMenu
                bare
                addons={nextScanAddons}
                onSetAddons={(addons) => onCardUpdate({ nextScanAddons: addons })}
              />
            ) : null
          }
          onPhotoChange={onPhotoChange}
          onDisplayNameChange={onDisplayNameChange}
        />
      )}

      <ContactItemChipList
        items={items}
        size={compact ? "compact" : "browse"}
        className={compact ? "pb-2" : undefined}
        listId={card.id}
        onReorder={compact ? handleCommitOrder : undefined}
      />

      {!compact ? (
        <footer className="mt-4 flex items-end justify-between">
          <p className="text-[9.5px] leading-[1.15] font-normal tracking-[0.08em] uppercase">
            {card.displayName || "Name"}
            <br />
            Portfolio
          </p>
          <button
            type="button"
            data-card-content
            data-no-swipe
            aria-label="Share"
            onClick={() => {
              const url = `${window.location.origin}/api/share/${shareToken}/pdf`;
              if (navigator.share) {
                void navigator.share({ title: card.displayName, url }).catch(() => undefined);
                return;
              }
              void navigator.clipboard?.writeText(url);
            }}
            className="text-[#111]"
          >
            <Share className="size-4" strokeWidth={1.25} aria-hidden />
          </button>
        </footer>
      ) : null}
      </div>
      {!compact && scrolledUnderQr ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 z-10 h-16 bg-gradient-to-b from-white to-transparent"
        />
      ) : null}
      {!compact ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-16 bg-gradient-to-t from-white to-transparent"
        />
      ) : null}

    </article>
  );
});

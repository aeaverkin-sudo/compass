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
import { clampNameLines } from "@/shared/components/name-or-title-field";
import { browseCardHeight, CARD_HEADER_NAME_SIZE_PX, type MainScreenMode } from "../layout";

const HERO_PHOTO_PX = 105;
const HERO_FONT = '"Helvetica Neue", Helvetica, Arial, sans-serif';
const HERO_MIN_PX = 16;

function splitHeroName(name: string) {
  const breakAt = name.indexOf("\n");
  if (breakAt < 0) return [name, ""] as const;
  return [name.slice(0, breakAt), name.slice(breakAt + 1).replace(/\n/g, "")] as const;
}

function heroLineSize(lines: string[], width: number, height: number) {
  if (!width || !height) return HERO_MIN_PX;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return HERO_MIN_PX;
  const shown = lines.filter((line) => line.length > 0);
  const count = shown.length > 1 ? 2 : 1;
  const heightLimit = count === 2 ? height / 2 : height;
  const widest = shown.reduce((longest, line) => (line.length > longest.length ? line : longest), shown[0] ?? "");
  let lo = HERO_MIN_PX;
  let hi = Math.max(HERO_MIN_PX, Math.floor(heightLimit));
  let best = HERO_MIN_PX;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    ctx.font = `300 ${mid}px ${HERO_FONT}`;
    const spacing = widest.length > 1 ? (widest.length - 1) * mid * -0.045 : 0;
    const tooWide = ctx.measureText(widest).width + spacing > width;
    if (tooWide) hi = mid - 1;
    else {
      best = mid;
      lo = mid + 1;
    }
  }
  return best;
}

function HeroName({
  value,
  onChange,
}: {
  value: string;
  onChange?: (displayName: string) => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(HERO_MIN_PX);
  const [first, second] = splitHeroName(value);
  const twoLines = value.includes("\n");

  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const fit = () =>
      setSize(
        heroLineSize(
          value.length === 0 ? ["Name or portfolio title"] : twoLines ? [first, second] : [value],
          box.clientWidth,
          box.clientHeight,
        ),
      );
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(box);
    const onTurn = () => fit();
    window.addEventListener("orientationchange", onTurn);
    void document.fonts?.ready.then(fit);
    return () => {
      observer.disconnect();
      window.removeEventListener("orientationchange", onTurn);
    };
  }, [first, second, twoLines, value]);

  const lineStyle = { fontSize: size, lineHeight: 1, height: twoLines ? size * 2 : size };

  return (
    <div ref={boxRef} data-card-content className="flex h-full w-full min-w-0 items-end overflow-hidden">
      {onChange ? (
        <textarea
          value={value}
          rows={twoLines ? 2 : 1}
          placeholder="Name or portfolio title"
          aria-label="Name or portfolio title"
          onChange={(event) => onChange(clampNameLines(event.target.value))}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key !== "Enter") return;
            event.preventDefault();
            if (value.includes("\n")) return;
            const start = event.currentTarget.selectionStart ?? value.length;
            const end = event.currentTarget.selectionEnd ?? start;
            onChange(clampNameLines(`${value.slice(0, start)}\n${value.slice(end)}`));
          }}
          onClick={(event) => event.stopPropagation()}
          className="compass-input block w-full resize-none overflow-hidden bg-transparent text-left font-light tracking-[-0.045em] text-[#111] outline-none placeholder:text-[#C8C8C8]"
          style={lineStyle}
        />
      ) : (
        <div className="w-full overflow-hidden text-left font-light tracking-[-0.045em] text-[#111]" style={lineStyle}>
          {twoLines ? (
            <>
              <div className="overflow-hidden whitespace-nowrap">{first || "\u00a0"}</div>
              <div className="overflow-hidden whitespace-nowrap">{second || "\u00a0"}</div>
            </>
          ) : (
            <div className="overflow-hidden whitespace-nowrap">{value || "\u00a0"}</div>
          )}
        </div>
      )}
    </div>
  );
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
  return (
    <div className="w-full">
      <div className="border-t-[0.5px] border-[#111]" />
      <div className="relative py-[22px]">
        <div className="flex items-stretch gap-2" style={{ height: HERO_PHOTO_PX }}>
          {onPhotoChange ? (
            <PhotoSlotPicker photo={card.photo ?? null} onPhotoChange={onPhotoChange} sizePx={HERO_PHOTO_PX} borderRadiusPx={0} />
          ) : card.photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img data-card-content src={card.photo} alt="" className="size-[105px] shrink-0 object-cover" />
          ) : null}
          <div className="min-w-0 flex-1 overflow-hidden">
            <HeroName value={card.displayName} onChange={onDisplayNameChange} />
          </div>
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
        className={cn(
          "flex min-h-0 flex-1 flex-col",
          !compact && "compass-card-scroll overflow-y-auto px-[calc(clamp(24px,6.1vw,28px)-1mm)] pb-8",
        )}
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
          showPlus={Boolean(onCardUpdate && card.photo)}
          nextScan={
            onCardUpdate && card.photo ? (
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

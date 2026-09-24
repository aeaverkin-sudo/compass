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

const HERO_PHOTO_PX = 128;
const HERO_FONT = '"Helvetica Neue", Helvetica, Arial, sans-serif';
const ROLE_RESERVE_PX = 26;

function splitHeroName(name: string) {
  const breakAt = name.indexOf("\n");
  if (breakAt < 0) return [name, ""] as const;
  return [name.slice(0, breakAt), name.slice(breakAt + 1).replace(/\n/g, "")] as const;
}

function heroLineSize(lines: string[], width: number, height: number) {
  if (!width || !height) return 16;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return 16;
  ctx.font = `600 100px ${HERO_FONT}`;
  const shown = lines.filter((line) => line.length > 0);
  const count = shown.length > 1 ? 2 : 1;
  const maxW = shown.reduce((widest, line) => {
    const measured = ctx.measureText(line).width - Math.max(0, line.length - 1);
    return Math.max(widest, measured);
  }, 0);
  const widthFont = maxW > 0 ? (100 * width) / maxW : 60;
  const heightFont = height / count;
  return Math.min(60, Math.max(16, Math.min(widthFont, heightFont)));
}

function HeroName({
  value,
  onChange,
}: {
  value: string;
  onChange?: (displayName: string) => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(16);
  const [first, second] = splitHeroName(value);
  const empty = value.length === 0;
  const twoLines = value.includes("\n");
  const lineCount = twoLines ? 2 : 1;

  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box || empty) return;
    const fit = () =>
      setSize(heroLineSize(twoLines ? [first, second] : [value], box.clientWidth, box.clientHeight));
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
  }, [empty, first, second, twoLines, value]);

  const lineStyle = empty
    ? { fontSize: 19, lineHeight: 1, fontWeight: 400, height: 19 }
    : {
        fontSize: size,
        lineHeight: 0.9,
        fontWeight: 600,
        letterSpacing: "-1px",
        height: size * lineCount * 0.9,
      };

  const holdScroll = (node: HTMLTextAreaElement) => {
    const scroller = node.closest<HTMLElement>(".compass-card-scroll");
    const top = scroller?.scrollTop ?? 0;
    requestAnimationFrame(() => {
      if (scroller) scroller.scrollTop = top;
      window.scrollTo(0, 0);
    });
  };

  return (
    <div ref={boxRef} data-card-content className="flex h-full w-full min-w-0 items-end overflow-hidden">
      {onChange ? (
        <textarea
          value={value}
          rows={lineCount}
          placeholder="Name or portfolio title"
          aria-label="Name or portfolio title"
          onChange={(event) => onChange(clampNameLines(event.target.value))}
          onFocus={(event) => holdScroll(event.currentTarget)}
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
          className="compass-input block w-full resize-none overflow-hidden whitespace-nowrap bg-transparent text-left text-[#111] outline-none placeholder:text-[#C8C8C8]"
          style={lineStyle}
        />
      ) : (
        <div className="w-full overflow-hidden whitespace-nowrap text-left text-[#111]" style={lineStyle}>
          {empty ? (
            <div className="text-[#C8C8C8]">Name or portfolio title</div>
          ) : twoLines ? (
            <>
              <div className="overflow-hidden whitespace-nowrap">{first || "\u00a0"}</div>
              <div className="overflow-hidden whitespace-nowrap">{second || "\u00a0"}</div>
            </>
          ) : (
            <div className="overflow-hidden whitespace-nowrap">{value}</div>
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
            <img data-card-content src={card.photo} alt="" className="size-[128px] shrink-0 object-cover" />
          ) : null}
          <div className="relative flex h-full min-w-0 flex-1 flex-col overflow-hidden">
            {showPlus ? <div className="absolute top-0 right-0 z-10">{nextScan}</div> : null}
            <div className="flex min-h-0 flex-1 flex-col justify-end overflow-hidden">
              <HeroName value={card.displayName} onChange={onDisplayNameChange} />
            </div>
            {positionTitle ? (
              <p
                data-card-content
                className="flex shrink-0 items-end text-[11px] leading-none font-normal tracking-[0.2em] text-[#999] uppercase"
                style={{ height: ROLE_RESERVE_PX }}
              >
                {positionTitle}
              </p>
            ) : null}
          </div>
        </div>
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

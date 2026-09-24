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
import { browseCardHeight, CARD_HEADER_NAME_SIZE_PX, RULE_GAP_PX, type MainScreenMode } from "../layout";

const HERO_PHOTO_PX = 128;
const HERO_FONT = '"Helvetica Neue", Helvetica, Arial, sans-serif';

function splitHeroName(name: string) {
  const breakAt = name.indexOf("\n");
  if (breakAt < 0) return [name, ""] as const;
  return [name.slice(0, breakAt), name.slice(breakAt + 1).replace(/\n/g, "")] as const;
}

function measureAt(ctx: CanvasRenderingContext2D, line: string, size: number, weight: number) {
  ctx.font = `${weight} ${size}px ${HERO_FONT}`;
  return ctx.measureText(line).width - Math.max(0, line.length - 1);
}

function heroLineSize(lines: string[], width: number, height: number, weight = 600) {
  if (!width || !height) return 16;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return 16;
  const shown = lines.filter((line) => line.length > 0);
  const count = shown.length > 1 ? 2 : 1;
  const maxW = shown.reduce((widest, line) => Math.max(widest, measureAt(ctx, line, 100, weight)), 0);
  const widthFont = maxW > 0 ? (100 * width) / maxW : 44;
  const heightFont = height / count;
  const max = weight === 400 ? 19 : 44;
  const min = weight === 400 ? 10 : 16;
  return Math.min(max, Math.max(min, Math.min(widthFont, heightFont)));
}

function wordNeedsWrap(word: string, width: number) {
  if (!width || word.includes(" ") || word.includes("\n")) return false;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return false;
  return measureAt(ctx, word, 16, 600) > width;
}

function splitLongWord(word: string) {
  const mid = Math.ceil(word.length / 2);
  return [word.slice(0, mid), word.slice(mid)] as const;
}

function HeroName({
  value,
  onChange,
  boxHeight,
}: {
  value: string;
  onChange?: (displayName: string) => void;
  boxHeight: number;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(16);
  const [wrapWord, setWrapWord] = useState(false);
  const [first, second] = splitHeroName(value);
  const empty = value.length === 0;
  const twoLines = value.includes("\n") || wrapWord;
  const lineCount = twoLines ? 2 : 1;

  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const fit = () => {
      const width = box.clientWidth;
      if (!value) {
        setWrapWord(false);
        setSize(heroLineSize(["Name or portfolio title"], width, boxHeight, 400));
        return;
      }
      const wrap = wordNeedsWrap(value, width);
      setWrapWord(wrap);
      const lines = value.includes("\n") ? [first, second] : wrap ? [...splitLongWord(value)] : [value];
      setSize(heroLineSize(lines, width, Math.max(16, boxHeight - 4)));
    };
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
  }, [boxHeight, first, second, value]);

  const lineStyle = empty
    ? { fontSize: 19, lineHeight: 1, fontWeight: 400, height: 19 }
    : {
        fontSize: size,
        lineHeight: 1,
        fontWeight: 600,
        letterSpacing: "-1px",
        height: size * lineCount,
      };

  const holdScroll = (node: HTMLTextAreaElement) => {
    const scroller = node.closest<HTMLElement>(".compass-card-scroll");
    const top = scroller?.scrollTop ?? 0;
    const pin = () => {
      if (scroller) scroller.scrollTop = top;
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    };
    pin();
    requestAnimationFrame(pin);
    window.addEventListener("scroll", pin, { passive: true });
    window.visualViewport?.addEventListener("scroll", pin);
    window.visualViewport?.addEventListener("resize", pin);
    const stop = () => {
      window.removeEventListener("scroll", pin);
      window.visualViewport?.removeEventListener("scroll", pin);
      window.visualViewport?.removeEventListener("resize", pin);
      node.removeEventListener("blur", stop);
    };
    node.addEventListener("blur", stop);
  };

  return (
    <div ref={boxRef} data-card-content className="flex h-full w-full min-w-0 items-end overflow-x-hidden overflow-y-visible">
      {onChange ? (
        <textarea
          value={value}
          rows={2}
          enterKeyHint="enter"
          placeholder="Name or portfolio title"
          aria-label="Name or portfolio title"
          data-no-swipe
          onChange={(event) => onChange(clampNameLines(event.target.value))}
          onFocus={(event) => holdScroll(event.currentTarget)}
          onPointerDown={(event) => event.stopPropagation()}
          onBeforeInput={(event) => {
            const native = event.nativeEvent;
            if (native.inputType !== "insertLineBreak") return;
            event.preventDefault();
            event.stopPropagation();
            if (value.includes("\n")) return;
            const start = event.currentTarget.selectionStart ?? value.length;
            const end = event.currentTarget.selectionEnd ?? start;
            onChange(clampNameLines(`${value.slice(0, start)}\n${value.slice(end)}`));
          }}
          onKeyDownCapture={(event) => event.stopPropagation()}
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
          className={cn(
            "compass-input m-0 block w-full max-h-full min-h-0 resize-none overflow-x-hidden overflow-y-hidden bg-transparent p-0 text-left text-[#111] outline-none placeholder:text-[#C8C8C8]",
            value.includes("\n") || wrapWord ? "whitespace-pre-wrap" : "whitespace-nowrap",
            wrapWord && "break-all",
          )}
          style={lineStyle}
        />
      ) : (
        <div
          className={cn(
            "w-full overflow-x-hidden text-left text-[#111]",
            wrapWord ? "whitespace-pre-wrap break-all" : "overflow-hidden whitespace-nowrap",
          )}
          style={lineStyle}
        >
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
      <div className="relative pb-[22px]" style={{ paddingTop: RULE_GAP_PX }}>
        <div className="flex shrink-0 items-stretch gap-2" style={{ height: HERO_PHOTO_PX }}>
          {onPhotoChange ? (
            <PhotoSlotPicker photo={card.photo ?? null} onPhotoChange={onPhotoChange} sizePx={HERO_PHOTO_PX} borderRadiusPx={0} />
          ) : card.photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img data-card-content src={card.photo} alt="" className="size-[128px] shrink-0 object-cover" />
          ) : null}
          <div className="relative flex h-full min-w-0 flex-1 flex-col justify-end">
            {showPlus ? <div className="absolute top-0 right-0 z-10">{nextScan}</div> : null}
            <div className="min-w-0" style={{ paddingRight: showPlus ? 20 : 0 }}>
              <HeroName
                value={card.displayName}
                onChange={onDisplayNameChange}
                boxHeight={HERO_PHOTO_PX - (positionTitle ? 18 : 4)}
              />
            </div>
            {positionTitle ? (
              <p
                data-card-content
                className="mt-1 text-[11px] leading-none font-normal tracking-[0.2em] text-[#999] uppercase"
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

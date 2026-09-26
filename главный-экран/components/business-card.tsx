"use client";

import { forwardRef, useCallback, useEffect, useLayoutEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { Plus, Share } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Card, ContactItem } from "@/shared/types";
import { useAppStore } from "@/shared/store/app-store";
import { PhotoSlotPicker } from "@landing/components/photo-slot-picker";
import { CardNameField } from "./card-name-field";
import { getCardItems, getNextScanAddons } from "@/shared/services/card-snapshot";
import { cardHasPhoto, cardPhotoSrc } from "@/shared/services/card-photo";
import { publicCardUrl } from "@/shared/services/public-card-url";
import { CardEditList } from "./card-edit-list";
import { ContactItemChipList } from "./contact-item-chip";
import { NextScanMenu } from "./next-scan-menu";
import { clampNameLines, NameOrTitleField } from "@/shared/components/name-or-title-field";
import {
  BOTTOM_PLATE_DROP_PX,
  browseCardHeight,
  CARD_HEADER_NAME_SIZE_PX,
  CARD_PHOTO_RADIUS_PX,
  CARD_PHOTO_SIZE_PX,
  CARD_PHOTO_TOP_PX,
  LIBRARY_NAME_FADE_PX,
  RULE_GAP_PX,
  type MainScreenMode,
} from "../layout";

const HERO_PHOTO_PX = 128;
/** One letter starts here; from the third it shrinks to the name column. */
const HERO_NAME_MAX_PX = 78;
const HERO_FONT = '"Helvetica Neue", Helvetica, Arial, sans-serif';
/** Role line under the name. Its box bottom sits on the photo's bottom edge. */
const HERO_ROLE_PX = 11;
/** Clear space after the descenders, before the role. */
const HERO_ROLE_GAP_PX = 4;
/**
 * Ink of g/y/p below a line-height of 1.
 * Helvetica Neue 600, "greg" at 78px: the tail ends 7px under the line box.
 */
const HERO_DESCENDER_OVERFLOW = 7 / 78;

function splitHeroName(name: string) {
  const breakAt = name.indexOf("\n");
  if (breakAt < 0) return [name, ""] as const;
  return [name.slice(0, breakAt), name.slice(breakAt + 1).replace(/\n/g, "")] as const;
}

function measureRaw(ctx: CanvasRenderingContext2D, line: string, size: number, weight: number) {
  ctx.font = `${weight} ${size}px ${HERO_FONT}`;
  return ctx.measureText(line).width;
}

function widthFontFor(ctx: CanvasRenderingContext2D, line: string, width: number, weight: number) {
  const raw = measureRaw(ctx, line, 100, weight);
  if (raw <= 0) return 44;
  const tracking = weight === 600 ? Math.max(0, line.length - 1) : 0;
  return ((width + tracking) * 100) / raw;
}

function heroLineSize(lines: string[], width: number, height: number, weight = 600) {
  if (!width || !height) return 16;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return 16;
  const shown = lines.filter((line) => line.length > 0);
  const count = shown.length > 1 ? 2 : 1;
  const widthFont = shown.reduce((tightest, line) => Math.min(tightest, widthFontFor(ctx, line, width, weight)), 44);
  const heightFont = height / count;
  const max = weight === 400 ? 19 : 44;
  const min = weight === 400 ? 10 : 16;
  return Math.min(max, Math.max(min, Math.min(widthFont, heightFont)));
}

const PLACEHOLDER = "Name or portfolio title";

function textWidth(text: string, size: number, weight: number) {
  const probe = document.createElement("span");
  probe.textContent = text;
  probe.style.cssText = `position:absolute;left:-9999px;white-space:nowrap;font-family:${HERO_FONT};font-weight:${weight};font-size:${size}px;line-height:1;letter-spacing:${weight === 600 ? "-1px" : "0px"}`;
  document.body.appendChild(probe);
  const width = probe.getBoundingClientRect().width;
  probe.remove();
  return width;
}

function fitToWidth(text: string, width: number, weight: number, max: number, min: number) {
  if (!width) return min;
  let lo = min;
  let hi = max;
  for (let step = 0; step < 14; step += 1) {
    const mid = (lo + hi) / 2;
    if (textWidth(text, mid, weight) <= width) lo = mid;
    else hi = mid;
  }
  return lo;
}

function wordNeedsWrap(word: string, width: number) {
  if (!width || word.includes(" ") || word.includes("\n")) return false;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return false;
  return measureRaw(ctx, word, 16, 600) - Math.max(0, word.length - 1) > width;
}

function splitLongWord(word: string) {
  const mid = Math.ceil(word.length / 2);
  return [word.slice(0, mid), word.slice(mid)] as const;
}

function HeroName({
  value,
  onChange,
  roleBelow,
}: {
  value: string;
  onChange?: (displayName: string) => void;
  /** Reserve the descender and a gap so the role sits clear of g, y, p. */
  roleBelow?: boolean;
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
        setSize(fitToWidth(PLACEHOLDER, Math.max(0, width - 4), 400, 19, 8));
        return;
      }
      const lines = value.includes("\n") ? [first, second].filter((line) => line.length > 0) : [value];
      const count = value.includes("\n") ? 2 : 1;
      const widthSize = lines.reduce(
        (tightest, line) => Math.min(tightest, fitToWidth(line, Math.max(0, width - 2), 600, HERO_NAME_MAX_PX, 8)),
        HERO_NAME_MAX_PX,
      );
      const gap = roleBelow ? HERO_ROLE_GAP_PX : 0;
      const heightSize = Math.max(8, (box.clientHeight - gap) / (count + (roleBelow ? HERO_DESCENDER_OVERFLOW : 0)));
      setWrapWord(false);
      setSize(Math.min(HERO_NAME_MAX_PX, widthSize, heightSize));
      const area = box.querySelector("textarea");
      if (area) {
        area.scrollTop = 0;
        area.scrollLeft = 0;
      }
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
  }, [first, roleBelow, second, value]);

  const rolePad = roleBelow ? size * HERO_DESCENDER_OVERFLOW + HERO_ROLE_GAP_PX : 0;
  const lineStyle = empty
    ? { fontSize: size, lineHeight: 1, fontWeight: 400, height: size }
    : {
        fontSize: size,
        lineHeight: 1,
        fontWeight: 600,
        letterSpacing: "-1px",
        boxSizing: "border-box" as const,
        height: size * lineCount + rolePad,
        paddingBottom: rolePad,
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
    <div ref={boxRef} data-card-content className="relative flex min-h-0 w-full min-w-0 flex-1 items-end overflow-x-hidden overflow-y-visible">
      {onChange ? (
        <>
        {empty ? (
          <span
            aria-hidden
            className="pointer-events-none absolute bottom-0 left-0 whitespace-nowrap border-b-[0.5px] border-[#D0D0D0] pb-px text-[#C8C8C8]"
            style={{ fontSize: size, fontWeight: 400, lineHeight: 1 }}
          >
            {PLACEHOLDER}
          </span>
        ) : null}
        <textarea
          value={value}
          rows={2}
          enterKeyHint="enter"
          placeholder=""
          aria-label="Name or portfolio title"
          data-no-swipe
          onChange={(event) => {
            event.currentTarget.scrollTop = 0;
            event.currentTarget.scrollLeft = 0;
            onChange(clampNameLines(event.target.value));
          }}
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
          className="compass-input m-0 block w-full max-h-full min-h-0 resize-none overflow-hidden bg-transparent p-0 text-left whitespace-pre text-[#111] outline-none"
          style={empty ? { ...lineStyle, color: "transparent", caretColor: "#111" } : lineStyle}
        />
        </>
      ) : (
        <div
          className={cn(
            "w-full overflow-x-hidden text-left text-[#111]",
            wrapWord ? "whitespace-pre-wrap break-all" : "overflow-hidden whitespace-nowrap",
          )}
          style={lineStyle}
        >
          {empty ? (
            <div className="whitespace-nowrap border-b-[0.5px] border-[#D0D0D0] pb-px text-[#C8C8C8]">{PLACEHOLDER}</div>
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

function cardIsReady(card: Card) {
  return Boolean(cardHasPhoto(card) && card.displayName.trim());
}

function EditorialHeader({
  card,
  positionTitle,
  showRule,
  showPlus,
  nextScan,
  onPhotoChange,
  onDisplayNameChange,
}: {
  card: Card;
  positionTitle?: string;
  showRule: boolean;
  showPlus: boolean;
  nextScan: ReactNode;
  onPhotoChange?: (photo: string | null, file?: File) => void;
  onDisplayNameChange?: (displayName: string) => void;
}) {
  const photoSrc = cardPhotoSrc(card);
  return (
    <div className="w-full">
      {showRule ? <div className="border-t-[0.5px] border-[#111]" /> : null}
      <div className="relative pb-[22px]" style={{ paddingTop: RULE_GAP_PX }}>
        <div className="flex shrink-0 items-stretch gap-3" style={{ height: HERO_PHOTO_PX }}>
          {onPhotoChange ? (
            <PhotoSlotPicker photo={photoSrc} onPhotoChange={onPhotoChange} sizePx={HERO_PHOTO_PX} borderRadiusPx={0} />
          ) : photoSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img data-card-content src={photoSrc} alt="" className="size-[128px] shrink-0 object-cover" />
          ) : null}
          <div className="relative flex h-full min-w-0 flex-1 flex-col">
            {showPlus ? (
              <div className="absolute top-0 right-0 z-10 translate-x-[6px] -translate-y-[6px]">{nextScan}</div>
            ) : null}
            <HeroName
              value={card.displayName}
              onChange={onDisplayNameChange}
              roleBelow={Boolean(positionTitle)}
            />
            {positionTitle ? (
              <p
                data-card-content
                className="m-0 shrink-0 text-[11px] leading-none font-normal tracking-[0.2em] text-[#999] uppercase"
                style={{ height: HERO_ROLE_PX }}
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

function EmptyPortfolioStart({
  card,
  onPhotoChange,
  onDisplayNameChange,
}: {
  card: Card;
  onPhotoChange?: (photo: string | null, file?: File) => void;
  onDisplayNameChange?: (displayName: string) => void;
}) {
  return (
    <div className="flex w-full flex-col items-center" style={{ paddingTop: CARD_PHOTO_TOP_PX }}>
      {onPhotoChange ? (
        <PhotoSlotPicker
          photo={cardPhotoSrc(card)}
          onPhotoChange={onPhotoChange}
          sizePx={CARD_PHOTO_SIZE_PX}
          borderRadiusPx={CARD_PHOTO_RADIUS_PX}
        />
      ) : null}
      {onDisplayNameChange ? (
        <label
          className="w-full text-center"
          style={{ marginTop: "2.3em", fontSize: CARD_HEADER_NAME_SIZE_PX }}
          data-card-content
        >
          <NameOrTitleField
            value={card.displayName}
            onChange={onDisplayNameChange}
            fontSizePx={CARD_HEADER_NAME_SIZE_PX}
            className="px-0 py-0 text-center"
          />
        </label>
      ) : null}
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
          <CardNameField
            value={card.displayName}
            onChange={onDisplayNameChange}
            fontSizePx={CARD_HEADER_NAME_SIZE_PX}
            className="text-center font-semibold tracking-[-1px] text-[#111]"
          />
        ) : (
          <p
            data-card-content
            className="text-center font-semibold tracking-[-1px] text-[#111]"
            style={{ fontSize: CARD_HEADER_NAME_SIZE_PX, fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif' }}
          >
            {card.displayName}
          </p>
        )}
        {positionTitle ? (
          <p data-card-content className="mt-1 text-center text-[11px] leading-none font-normal tracking-[0.2em] text-[#999] uppercase">
            {positionTitle}
            {positionCompany ? <span> · {positionCompany}</span> : null}
          </p>
        ) : null}
      </div>
    </div>
  );
}

import { publicCardUrl } from "@/shared/services/public-card-url";

function CardShareFooter({
  name,
  publicToken,
  className,
  hideShare = false,
}: {
  name: string;
  publicToken: string;
  className?: string;
  hideShare?: boolean;
}) {
  return (
    <footer className={cn("flex items-end justify-between", className)}>
      <p className="text-[9.5px] leading-[1.15] font-normal tracking-[0.08em] uppercase">
        {name || "Name"}
        <br />
        Portfolio
      </p>
      {hideShare ? null : (
      <button
        type="button"
        data-card-content
        data-no-swipe
        aria-label="Share"
        onClick={() => {
          if (!publicToken) return;
          const url = publicCardUrl(publicToken);
          if (navigator.share) {
            void navigator.share({ title: name, url }).catch(() => undefined);
            return;
          }
          void navigator.clipboard?.writeText(url);
        }}
        className="text-[#111]"
      >
        <Share className="size-4" strokeWidth={1.25} aria-hidden />
      </button>
      )}
    </footer>
  );
}

type BusinessCardProps = {
  card: Card;
  library: ContactItem[];
  mode: MainScreenMode;
  libraryCardHeightPx?: number;
  onEmptyAreaTap: () => void;
  onPhotoChange?: (photo: string | null, file?: File) => void;
  onDisplayNameChange?: (displayName: string) => void;
  onCardUpdate?: (data: Partial<Card>) => void;
  editing?: boolean;
  fillHint?: boolean;
  onFill?: () => void;
  composeOnMount?: boolean;
  /** Public /c/ page: same card, no QR, plus, or share. */
  readOnly?: boolean;
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
    editing = false,
    fillHint = false,
    onFill,
    composeOnMount = false,
    readOnly = false,
  },
  ref,
) {
  const setCardItemOrder = useAppStore((state) => state.setCardItemOrder);
  const items = getCardItems(card, library);
  const chosen = items.find((item) => item.id === card.headerItemId);
  const positionTitle = chosen?.value.trim() || card.title.trim() || undefined;
  const compact = mode === "library";
  const nextScanAddons = getNextScanAddons(card);
  const ready = cardIsReady(card);
  const blank = !cardHasPhoto(card) && !card.displayName.trim();
  const bare = !compact && ready && items.length === 0 && !editing;
  const articleRef = useRef<HTMLElement | null>(null);
  const previewScrollRef = useRef<HTMLDivElement | null>(null);
  const [scrolledUnderQr, setScrolledUnderQr] = useState(false);
  const [previewPull, setPreviewPull] = useState(0);
  const [previewPulling, setPreviewPulling] = useState(false);
  const [previewFade, setPreviewFade] = useState({ top: false, bottom: false });

  const syncPreviewFade = useCallback(() => {
    const el = previewScrollRef.current;
    if (!el) return;
    const maxScroll = el.scrollHeight - el.clientHeight;
    const next = {
      top: el.scrollTop > 2,
      bottom: maxScroll > 1 && el.scrollTop < maxScroll - 1,
    };
    setPreviewFade((current) =>
      current.top === next.top && current.bottom === next.bottom ? current : next,
    );
  }, []);

  const handleCommitOrder = useCallback(
    (orderedIds: string[]) => {
      setCardItemOrder(card.id, orderedIds);
    },
    [card.id, setCardItemOrder],
  );

  useEffect(() => {
    if (!compact) return;
    const el = previewScrollRef.current;
    if (!el) return;
    syncPreviewFade();
    const observer = new ResizeObserver(syncPreviewFade);
    observer.observe(el);
    return () => observer.disconnect();
  }, [compact, items, syncPreviewFade]);

  useEffect(() => {
    if (!compact) return;
    const el = previewScrollRef.current;
    if (!el) return;
    let pointerId = -1;
    let startY = 0;
    let dragging = false;
    const fits = () => el.scrollHeight <= el.clientHeight + 1;
    const atTop = () => el.scrollTop <= 0;
    const atBottom = () => el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
    const down = (event: PointerEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest("input, textarea")) return;
      pointerId = event.pointerId;
      startY = event.clientY;
      dragging = true;
    };
    const move = (event: PointerEvent) => {
      if (!dragging || event.pointerId !== pointerId) return;
      const dy = event.clientY - startY;
      const pastEdge = fits() || (dy > 0 && atTop()) || (dy < 0 && atBottom());
      if (!pastEdge) {
        setPreviewPulling(false);
        setPreviewPull(0);
        return;
      }
      if (Math.abs(dy) < 5) return;
      if (event.cancelable) event.preventDefault();
      setPreviewPulling(true);
      setPreviewPull(Math.sign(dy) * Math.min(Math.abs(dy) * 0.45, 72));
    };
    const up = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) return;
      dragging = false;
      setPreviewPulling(false);
      setPreviewPull(0);
    };
    el.addEventListener("pointerdown", down);
    document.addEventListener("pointermove", move, { passive: false });
    document.addEventListener("pointerup", up);
    document.addEventListener("pointercancel", up);
    return () => {
      el.removeEventListener("pointerdown", down);
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      document.removeEventListener("pointercancel", up);
    };
  }, [compact]);

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
          ? "compass-card compass-card-library relative min-h-0 w-full min-w-0 justify-start overflow-hidden pb-3 transition-[transform,box-shadow,height] duration-[460ms] ease-out"
          : "relative min-h-0 overflow-hidden bg-white text-[#111]",
      )}
      style={
        compact
          ? {
              height: libraryCardHeightPx,
              paddingTop: LIBRARY_NAME_FADE_PX,
            }
          : {
              height: readOnly
                ? "calc(100lvh - env(safe-area-inset-top))"
                : browseCardHeight(),
            }
      }
    >
      {!compact ? (
        <div className="shrink-0 px-[calc(clamp(24px,6.1vw,28px)-3mm)]">
          {blank ? (
            <EmptyPortfolioStart
              card={card}
              onPhotoChange={onPhotoChange}
              onDisplayNameChange={onDisplayNameChange}
            />
          ) : (
            <EditorialHeader
              card={card}
              positionTitle={positionTitle}
              showRule={ready}
              showPlus={Boolean(onCardUpdate && ready)}
              nextScan={
                onCardUpdate && ready ? (
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
        </div>
      ) : null}
      {bare ? (
        <div className="flex min-h-0 flex-1 flex-col px-[calc(clamp(24px,6.1vw,28px)-3mm)]">
          <div className="flex flex-1 flex-col items-center justify-center">
            {readOnly ? null : (
            <button
              type="button"
              data-card-content
              data-no-swipe
              aria-label="Add"
              onClick={onFill}
              className="flex size-7 items-center justify-center bg-transparent"
            >
              <Plus className="size-7 text-[#111]" strokeWidth={1} aria-hidden />
            </button>
            )}
            {fillHint ? (
              <p className="compass-block compass-sky mt-5 max-w-[240px] px-3 py-2.5 text-center text-[13px] leading-[1.35] font-normal text-[#111]">
                Add contacts, professional details, and files.
              </p>
            ) : null}
          </div>
          <CardShareFooter name={card.displayName} publicToken={card.publicToken} hideShare={readOnly} className="pb-6" />
        </div>
      ) : null}
      <div className={cn("relative flex min-h-0 flex-1 flex-col", bare && "hidden")}>
      <div
        ref={compact ? previewScrollRef : undefined}
        data-preview-scroll={compact ? "" : undefined}
        className={cn(
          "flex min-h-0 flex-1 flex-col",
          compact && "compass-card-scroll w-full overflow-x-hidden overflow-y-auto px-[calc(clamp(24px,6.1vw,28px)-3mm)]",
          !compact && "compass-card-scroll overflow-x-hidden overflow-y-auto px-[calc(clamp(24px,6.1vw,28px)-3mm)] pb-8",
        )}
        onScroll={
          compact
            ? syncPreviewFade
            : (event) => setScrolledUnderQr(event.currentTarget.scrollTop > 2)
        }
      >
      <div
        className={compact ? "flex w-full flex-col" : "contents"}
        style={
          compact
            ? {
                transform: previewPull ? `translateY(${previewPull}px)` : undefined,
                transition: previewPulling ? "none" : "transform 420ms cubic-bezier(0.2, 0.8, 0.2, 1)",
              }
            : undefined
        }
      >
      {compact ? (
        <CompactHeader
          card={card}
          positionTitle={positionTitle}
          onDisplayNameChange={onDisplayNameChange}
        />
      ) : null}

      {!compact && editing ? (
        <CardEditList card={card} items={library} composeOnMount={composeOnMount} />
      ) : (
      <ContactItemChipList
        items={items}
        size={compact ? "compact" : "browse"}
        className={compact ? "pb-2" : undefined}
        listId={card.id}
        onReorder={compact ? handleCommitOrder : undefined}
        onChooseHeader={
          onCardUpdate
            ? (itemId) => {
                if (card.headerItemId === itemId) {
                  onCardUpdate({ headerItemId: undefined, title: "" });
                  return;
                }
                const item = items.find((entry) => entry.id === itemId);
                if (!item) return;
                onCardUpdate({ headerItemId: itemId, title: item.value.trim() });
              }
            : undefined
        }
      />
      )}

      {!compact && !editing && ready ? (
        <CardShareFooter name={card.displayName} publicToken={card.publicToken} hideShare={readOnly} className="mt-4" />
      ) : null}
      </div>
      </div>
      {!compact && scrolledUnderQr ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 z-10 h-16 bg-gradient-to-b from-white to-transparent"
        />
      ) : null}
      </div>
      {compact && (previewFade.top || previewPull < 0) ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 z-10 bg-gradient-to-b from-white to-transparent"
          style={{ height: 64 }}
        />
      ) : null}
      {compact && (previewFade.bottom || previewPull > 0) ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-white to-transparent"
          style={{ height: 48 }}
        />
      ) : null}
      {!compact && !bare ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-16 bg-gradient-to-t from-white to-transparent"
          style={{ transform: `translateY(${BOTTOM_PLATE_DROP_PX}px)` }}
        />
      ) : null}

    </article>
  );
});

"use client";

import { forwardRef, useCallback, useEffect, useLayoutEffect, useRef, useState, type MouseEvent, type ReactNode, type RefObject } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Plus, Share } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Card, ContactItem } from "@/shared/types";
import type { DeliveredNote } from "@/shared/services/notes-types";
import { flushNotesSync, notesAreSyncing, releaseOwnerNotes } from "@/shared/services/notes-sync";
import { publicCardUrl } from "@/shared/services/public-card-url";
import {
  primePublicCardPdf,
  shareCardChoice,
  subscribeCardPdfStale,
  type CardShareChoice,
} from "@/shared/services/save-public-card-pdf";
import { AccountBand } from "@/shared/components/account-band";
import { CardPdfSource } from "@/shared/components/card-pdf-source";
import { composeCard } from "@/shared/services/card-zones";
import { PDF_PAD, pdfBlockPlan, pdfNotesPresent } from "@/shared/services/pdf-pages";
import { useAppStore } from "@/shared/store/app-store";
import { PhotoSlotPicker } from "@landing/components/photo-slot-picker";
import { CardNameField } from "./card-name-field";
import { getCardItems, getNextScanAddons } from "@/shared/services/card-snapshot";
import { cardHasPhoto, cardPhotoSrc } from "@/shared/services/card-photo";
import { CardEditList } from "./card-edit-list";
import { ContactItemChipList } from "./contact-item-chip";
import { NextScanMenu } from "./next-scan-menu";
import { NotesRubric } from "./notes-rubric";
import { useOwnerNotesDelivery } from "../hooks/use-owner-notes-delivery";
import { clampNameLines, NameOrTitleField } from "@/shared/components/name-or-title-field";
import {
  TOP_VEIL_PX,
  browseCardHeight,
  CARD_HEADER_NAME_SIZE_PX,
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
/** Clear space after the descenders, before the role. */
const HERO_ROLE_GAP_PX = 4;
/**
 * Ink of g/y/p below a line-height of 1.
 * Helvetica Neue 600, "greg" at 78px: the tail ends 7px under the line box.
 */
const HERO_DESCENDER_OVERFLOW = 0.09;

function splitHeroName(name: string) {
  const breakAt = name.indexOf("\n");
  if (breakAt < 0) return [name, ""] as const;
  return [name.slice(0, breakAt), name.slice(breakAt + 1).replace(/\n/g, "")] as const;
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
      const heightSize = Math.max(8, (box.clientHeight - gap) / (count + HERO_DESCENDER_OVERFLOW));
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

  const descender = size * HERO_DESCENDER_OVERFLOW;
  const rolePad = descender + (roleBelow ? HERO_ROLE_GAP_PX : 0);
  const lineStyle = {
    fontSize: size,
    lineHeight: 1,
    fontWeight: empty ? 400 : 600,
    letterSpacing: empty ? "0px" : "-1px",
    boxSizing: "border-box" as const,
    height: size * (empty ? 1 : lineCount) + rolePad,
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
            className="pointer-events-none absolute left-0 whitespace-nowrap border-b-[0.5px] border-[#D0D0D0] pb-px text-[#C8C8C8]"
            style={{ fontSize: size, fontWeight: 400, lineHeight: 1, bottom: descender }}
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
          autoCapitalize="words"
          autoCorrect="off"
          spellCheck={false}
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
          className="compass-input m-0 block w-full max-h-full min-h-0 resize-none overflow-x-hidden overflow-y-visible bg-transparent p-0 text-left whitespace-pre text-[#111] outline-none"
          style={empty ? { ...lineStyle, color: "transparent", caretColor: "#111" } : lineStyle}
        />
        </>
      ) : (
        <div
          className={cn(
            "w-full overflow-x-hidden overflow-y-visible text-left text-[#111]",
            wrapWord ? "whitespace-pre-wrap break-all" : "whitespace-nowrap",
          )}
          style={lineStyle}
        >
          {empty ? (
            <div className="whitespace-nowrap border-b-[0.5px] border-[#D0D0D0] pb-px text-[#C8C8C8]">{PLACEHOLDER}</div>
          ) : twoLines ? (
            <>
              <div className="whitespace-nowrap">{first || "\u00a0"}</div>
              <div className="whitespace-nowrap">{second || "\u00a0"}</div>
            </>
          ) : (
            <div className="whitespace-nowrap">{value}</div>
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
  sheetIndex,
  sheetTotal,
  onPhotoChange,
  onDisplayNameChange,
}: {
  card: Card;
  positionTitle?: string;
  showRule: boolean;
  showPlus: boolean;
  nextScan: ReactNode;
  sheetIndex?: number;
  sheetTotal?: number;
  onPhotoChange?: (photo: string | null, file?: File) => void;
  onDisplayNameChange?: (displayName: string) => void;
}) {
  const photoSrc = cardPhotoSrc(card);
  const sheetMark = showRule && sheetIndex && sheetTotal ? `${sheetIndex}/${sheetTotal}` : null;
  return (
    <div className="w-full">
      {sheetMark ? (
        <p className="m-0 mb-1 text-right text-[11px] leading-none font-normal tracking-[0.1em] text-[#999]">
          {sheetMark}
        </p>
      ) : null}
      {showRule ? <div className="border-t-[0.5px] border-[#111]" /> : null}
      <div className="relative pb-[22px]" style={{ paddingTop: RULE_GAP_PX }}>
        <div className="flex shrink-0 items-stretch gap-3" style={{ height: HERO_PHOTO_PX }}>
          {onPhotoChange ? (
            <PhotoSlotPicker photo={photoSrc} onPhotoChange={onPhotoChange} sizePx={HERO_PHOTO_PX} borderRadiusPx={0} />
          ) : photoSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img data-card-content src={photoSrc} alt="" fetchPriority="high" className="size-[128px] shrink-0 object-cover" />
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
                className="m-0 line-clamp-3 min-w-0 shrink-0 overflow-hidden text-[11px] leading-[1.25] font-normal tracking-[0.2em] text-[#999] uppercase"
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
  onStartBlocked,
}: {
  card: Card;
  onPhotoChange?: (photo: string | null, file?: File) => void;
  onDisplayNameChange?: (displayName: string) => void;
  onStartBlocked?: () => void;
}) {
  return (
    <div className="flex w-full flex-col items-center" style={{ paddingTop: CARD_PHOTO_TOP_PX }}>
      {onPhotoChange ? (
        <PhotoSlotPicker
          photo={cardPhotoSrc(card)}
          onPhotoChange={onPhotoChange}
          sizePx={CARD_PHOTO_SIZE_PX}
          borderRadiusPx={0}
          onPickBlocked={onStartBlocked}
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
            onEditBlocked={onStartBlocked}
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

const SHARE_CHOICES: { choice: CardShareChoice; label: string }[] = [
  { choice: "link", label: "Link" },
  { choice: "pdf", label: "PDF" },
];

function CardShareFooter({
  name,
  className,
  onShare,
  onPrepareShare,
}: {
  name: string;
  className?: string;
  onShare?: (choice: CardShareChoice) => void;
  onPrepareShare?: () => void;
}) {
  const anchorRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [place, setPlace] = useState({ right: 0, bottom: 0 });

  useLayoutEffect(() => {
    if (!open) return;
    const rect = anchorRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPlace({
      right: Math.max(0, window.innerWidth - rect.right),
      bottom: window.innerHeight - rect.top + 8,
    });
  }, [open]);

  return (
    <footer className={cn("flex items-end justify-between", className)}>
      <div>
        <p className="text-[9.5px] leading-[1.15] font-normal tracking-[0.08em] uppercase">
          {name || "Name"}
          <br />
          Portfolio
        </p>
      </div>
      {onShare ? (
        <Dialog.Root
          open={open}
          onOpenChange={(next) => {
            setOpen(next);
            if (next) onPrepareShare?.();
          }}
        >
          <Dialog.Trigger asChild>
            <button
              ref={anchorRef}
              type="button"
              data-card-content
              data-no-swipe
              aria-label="Share"
              onPointerDown={onPrepareShare}
              className="text-[#111] outline-none"
            >
              <Share className="size-4" strokeWidth={1.25} aria-hidden />
            </button>
          </Dialog.Trigger>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-40 bg-[#111]/20" />
            <Dialog.Content
              aria-describedby={undefined}
              data-no-swipe
              onOpenAutoFocus={(event) => event.preventDefault()}
              onCloseAutoFocus={(event) => event.preventDefault()}
              className="fixed z-40 w-max border-0 bg-sky px-1.5 py-1 text-center text-[#111] shadow-none outline-none"
              style={{
                right: place.right,
                bottom: place.bottom,
                fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
              }}
            >
              <Dialog.Title className="sr-only">Share</Dialog.Title>
              <div className="flex flex-col items-center">
                {SHARE_CHOICES.map(({ choice, label }) => (
                  <Dialog.Close asChild key={choice}>
                    <button
                      type="button"
                      className="px-2.5 py-2 text-[13px] font-normal tracking-[0.14em] text-[#111] uppercase outline-none focus:outline-none focus-visible:outline-none"
                      onClick={() => onShare(choice)}
                    >
                      {label}
                    </button>
                  </Dialog.Close>
                ))}
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      ) : null}
    </footer>
  );
}

function PdfCard({
  card,
  items,
  positionTitle,
  ready,
  readOnly,
  deliveredNotes,
  ownerNotes,
  pdfMask,
}: {
  card: Card;
  items: ContactItem[];
  positionTitle?: string;
  ready: boolean;
  readOnly: boolean;
  deliveredNotes: DeliveredNote[];
  ownerNotes: Card["nextScanAddons"];
  pdfMask: number[] | null;
}) {
  const zoneIds = composeCard(items).zones.map((zone) => zone.id);
  const plan = pdfBlockPlan(zoneIds, pdfNotesPresent(readOnly ? deliveredNotes : ownerNotes));
  const shown = pdfMask ? plan.filter((_, index) => pdfMask.includes(index)) : plan;
  const zoneFilter = shown.flatMap((block) => (block.kind === "zone" ? [block.id] : []));
  return (
    <article data-pdf-card className="w-full shrink-0 bg-white text-[#111]" style={{ fontFamily: HERO_FONT }}>
      <div style={{ paddingLeft: PDF_PAD, paddingRight: PDF_PAD }}>
        {shown.some((block) => block.kind === "header") ? (
          <div data-pdf-block="">
            <EditorialHeader
              card={card}
              positionTitle={positionTitle}
              showRule={false}
              showPlus={false}
              nextScan={null}
            />
          </div>
        ) : null}
        {zoneFilter.length > 0 ? (
          <ContactItemChipList items={items} size="browse" underlineLinks markPdfBlocks pdfZoneIds={zoneFilter} />
        ) : null}
        {shown.some((block) => block.kind === "notes") ? (
          <NotesRubric
            pdfBlock
            ownerNotes={readOnly ? undefined : ownerNotes}
            deliveredNotes={readOnly ? deliveredNotes : undefined}
          />
        ) : null}
        {shown.some((block) => block.kind === "footer") ? (
          <div data-pdf-block="">
            <div aria-hidden className="h-[1lh]" />
            <CardShareFooter name={card.displayName} />
            <div className="mt-4" style={{ marginLeft: -PDF_PAD, marginRight: -PDF_PAD }}>
              <AccountBand token={card.publicToken} inset={PDF_PAD} safe={false} />
            </div>
          </div>
        ) : null}
      </div>
    </article>
  );
}

type BusinessCardProps = {
  card: Card;
  library: ContactItem[];
  mode: MainScreenMode;
  libraryCardHeightPx?: number;
  onEmptyAreaTap?: () => void;
  onPhotoChange?: (photo: string | null, file?: File) => void;
  onDisplayNameChange?: (displayName: string) => void;
  onCardUpdate?: (data: Partial<Card>) => void;
  editing?: boolean;
  fillHint?: boolean;
  onFill?: () => void;
  composeOnMount?: boolean;
  openAddRef?: RefObject<(() => void) | null>;
  onComposingChange?: (open: boolean) => void;
  /** Public /c/ page: same card, no QR, plus, or share link. */
  readOnly?: boolean;
  /** Frozen trial: the card stays visible, share is closed. */
  frozen?: boolean;
  /** Sits on its own line under the portfolio name and share control. */
  shareFootnote?: ReactNode;
  /** One-time notes delivered to the first real viewer. */
  deliveredNotes?: DeliveredNote[];
  /** Trial add slide: same empty start, taps ask to register. */
  onPortfolioStartBlocked?: () => void;
  /** Public /c/ only: sky actions under the portfolio line. */
  publicBar?: ReactNode;
  /** Print sheets of this same card. No QR, no share, no fixed screen height. */
  pdf?: boolean;
  /** Null paints every block. An array is one phone sheet. */
  pdfMask?: number[] | null;
  /** Place among the owner's portfolios, shown above the masthead rule. */
  sheetIndex?: number;
  sheetTotal?: number;
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
    openAddRef,
    onComposingChange,
    readOnly = false,
    frozen = false,
    shareFootnote,
    deliveredNotes = [],
    onPortfolioStartBlocked,
    publicBar,
    pdf = false,
    pdfMask = null,
    sheetIndex,
    sheetTotal,
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
  const ownerNotesKey = nextScanAddons
    .map((note) => `${note.id}:${note.type}:${note.attachmentId ?? ""}:${note.content}`)
    .join("|");

  const [pdfGeneration, setPdfGeneration] = useState(0);

  useEffect(
    () =>
      subscribeCardPdfStale((cardId) => {
        if (cardId === card.id) setPdfGeneration((value) => value + 1);
      }),
    [card.id],
  );

  const shareInput = () => {
    if (!card.publicToken) return null;
    if (readOnly) {
      return {
        cardId: card.id,
        publicToken: card.publicToken,
        displayName: card.displayName,
        notes: deliveredNotes,
      };
    }
    return {
      cardId: card.id,
      publicToken: card.publicToken,
      displayName: card.displayName,
      revision: `${card.photoAttachmentId ?? ""}\n${card.title}\n${ownerNotesKey}`,
    };
  };

  useEffect(() => {
    if (pdf || readOnly || compact || editing || frozen || !ready || !card.publicToken) return;
    let cancelled = false;
    let wait: number | undefined;
    const prepare = () => {
      if (cancelled) return;
      if (notesAreSyncing(card.id)) {
        wait = window.setTimeout(prepare, 200);
        return;
      }
      void primePublicCardPdf({
        cardId: card.id,
        publicToken: card.publicToken,
        displayName: card.displayName,
        revision: `${card.photoAttachmentId ?? ""}\n${card.title}\n${ownerNotesKey}`,
      }).catch((error) => console.error("[pdf] prepare failed", error));
    };
    prepare();
    return () => {
      cancelled = true;
      if (wait !== undefined) window.clearTimeout(wait);
    };
    // ownerNotesKey stands in for card.nextScanAddons. The server reads the pending notes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdf, readOnly, compact, editing, frozen, ready, card.id, card.publicToken, ownerNotesKey, pdfGeneration]);

  const primeShare = () => {
    flushNotesSync(card.id);
    const input = shareInput();
    if (!input || notesAreSyncing(card.id)) return;
    void primePublicCardPdf(input).catch((error) => console.error("[pdf] prepare failed", error));
  };

  const handleShare = (choice: CardShareChoice) => {
    const input = shareInput();
    if (!input) return;
    const title = card.displayName.trim() || "Portfolio";
    const hadNotes = ownerNotesKey.length > 0;
    void shareCardChoice(input, choice, { title, url: publicCardUrl(card) }).then((sent) => {
      if (!sent || readOnly || !hadNotes) return;
      releaseOwnerNotes(card.id, choice, card.publicToken);
    });
  };

  useOwnerNotesDelivery(card.id, !pdf && !readOnly && !compact && nextScanAddons.length > 0);
  const blank = !cardHasPhoto(card) && !card.displayName.trim();
  const showShareFooter = !compact && !editing && ready && (items.length > 0 || Boolean(card.publicToken));
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
    if (!onEmptyAreaTap) return;
    if ((event.target as HTMLElement).closest("[data-card-content]")) return;
    onEmptyAreaTap();
  };

  if (pdf) {
    return (
      <PdfCard
        card={card}
        items={items}
        positionTitle={positionTitle}
        ready={ready}
        readOnly={readOnly}
        deliveredNotes={deliveredNotes}
        ownerNotes={nextScanAddons}
        pdfMask={pdfMask}
      />
    );
  }

  const paintPdf = !compact && !editing && !frozen && ready && Boolean(card.publicToken) && !readOnly;

  return (
    <>
    {paintPdf ? (
      <CardPdfSource
        key={`${card.publicToken}:${ownerNotesKey}:${pdfGeneration}:${card.displayName}:${card.photoAttachmentId ?? ""}`}
        input={{
          cardId: card.id,
          publicToken: card.publicToken,
          displayName: card.displayName,
          revision: `${card.photoAttachmentId ?? ""}\n${card.title}\n${ownerNotesKey}`,
        }}
        epoch={pdfGeneration}
      >
        {(mask) => (
          <PdfCard
            card={card}
            items={items}
            positionTitle={positionTitle}
            ready={ready}
            readOnly={false}
            deliveredNotes={deliveredNotes}
            ownerNotes={nextScanAddons}
            pdfMask={mask}
          />
        )}
      </CardPdfSource>
    ) : null}
    <article
      ref={(node) => {
        articleRef.current = node;
        if (typeof ref === "function") ref(node);
        else if (ref) ref.current = node;
      }}
      onClick={handleClick}
      data-public-card={readOnly ? "" : undefined}
      className={cn(
        "compass-layer flex w-full cursor-default flex-col",
        compact
          ? "compass-card compass-card-library relative min-h-0 w-full min-w-0 justify-start overflow-hidden pb-3 transition-[transform,box-shadow,height] duration-[460ms] ease-out"
          : "relative min-h-0 overflow-hidden bg-white text-[#111]",
        !compact && readOnly && "h-svh",
      )}
      style={
        compact
          ? {
              height: libraryCardHeightPx,
              paddingTop: LIBRARY_NAME_FADE_PX,
            }
          : {
              height: readOnly ? "calc(100svh - var(--card-frame-top, 0px))" : browseCardHeight(),
              paddingBottom: readOnly ? "var(--public-band-bottom, 0px)" : undefined,
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
              onStartBlocked={onPortfolioStartBlocked}
            />
          ) : (
            <EditorialHeader
              card={card}
              positionTitle={positionTitle}
              showRule={ready && !readOnly}
              sheetIndex={sheetIndex}
              sheetTotal={sheetTotal}
              showPlus={Boolean(onCardUpdate && ready && items.length > 0)}
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
          {publicBar ? <div className="mt-auto -mx-[calc(clamp(24px,6.1vw,28px)-3mm)]">{publicBar}</div> : null}
        </div>
      ) : null}
      <div className={cn("relative flex min-h-0 flex-1 flex-col", bare && "hidden")}>
      <div
        ref={compact ? previewScrollRef : undefined}
        data-preview-scroll={compact ? "" : undefined}
        className={cn(
          "flex min-h-0 flex-1 flex-col",
          compact && "compass-card-scroll w-full overflow-x-hidden overflow-y-auto px-[calc(clamp(24px,6.1vw,28px)-3mm)]",
          !compact && "compass-card-scroll overflow-x-hidden overflow-y-auto px-[calc(clamp(24px,6.1vw,28px)-3mm)]",
        )}
        onScroll={
          compact
            ? syncPreviewFade
            : (event) => setScrolledUnderQr(event.currentTarget.scrollTop > 2)
        }
      >
      <div
        className={compact ? "flex w-full flex-col" : "flex w-full grow flex-col"}
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
        <CardEditList
          card={card}
          items={library}
          composeOnMount={composeOnMount}
          openAddRef={openAddRef}
          onComposingChange={onComposingChange}
        />
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
        underlineLinks={readOnly}
      />
      )}

      {!compact && !editing ? (
        <NotesRubric
          ownerNotes={readOnly ? undefined : nextScanAddons}
          deliveredNotes={readOnly ? deliveredNotes : undefined}
        />
      ) : null}
      {!compact && !editing && (showShareFooter || shareFootnote || publicBar) ? (
        <div className={cn("mt-auto shrink-0 text-[13px] leading-snug", !readOnly && "pb-[2lh]")}>
          {showShareFooter ? (
            <>
              <div aria-hidden className="h-[1lh]" />
              <CardShareFooter
                name={card.displayName}
                onShare={readOnly || !card.publicToken || frozen ? undefined : handleShare}
                onPrepareShare={readOnly || !card.publicToken || frozen ? undefined : primeShare}
              />
            </>
          ) : null}
          {shareFootnote ? (
            <>
              {showShareFooter ? <div aria-hidden className="h-[2lh]" /> : <div aria-hidden className="h-[1lh]" />}
              <div className="text-center">{shareFootnote}</div>
            </>
          ) : null}
          {publicBar && !bare ? (
            <div className="mt-4 -mx-[calc(clamp(24px,6.1vw,28px)-3mm)]">{publicBar}</div>
          ) : null}
        </div>
      ) : null}
      </div>
      </div>
      {!compact && scrolledUnderQr ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 z-10 bg-gradient-to-b from-white to-white/0"
          style={{ height: TOP_VEIL_PX }}
        />
      ) : null}
      </div>
      {compact && (previewFade.top || previewPull < 0) ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 z-10 bg-gradient-to-b from-white to-white/0"
          style={{ height: 64 }}
        />
      ) : null}
      {compact && (previewFade.bottom || previewPull > 0) ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-white to-white/0"
          style={{ height: 48 }}
        />
      ) : null}
    </article>
    </>
  );
});

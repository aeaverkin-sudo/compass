"use client";

import { forwardRef, useCallback, useEffect, useRef, useState, type MouseEvent, type ReactNode, type RefObject } from "react";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Card, ContactItem } from "@/shared/types";
import type { DeliveredNote } from "@/shared/services/notes-types";
import { AccountBand } from "@/shared/components/account-band";
import { composeCard, orderCardZones } from "@/shared/services/card-zones";
import { PDF_PAD, pdfBlockPlan, pdfNotesPresent } from "@/shared/services/pdf-pages";
import { useAppStore } from "@/shared/store/app-store";
import { PhotoSlotPicker, photoSlotLookClass } from "@landing/components/photo-slot-picker";
import { CardNameField } from "./card-name-field";
import { getCardItems, getNextScanAddons } from "@/shared/services/card-snapshot";
import { cardHasPhoto, cardPhotoSrc } from "@/shared/services/card-photo";
import { CardEditList } from "./card-edit-list";
import { ContactItemChipList } from "./contact-item-chip";
import { NotesRubric } from "./notes-rubric";
import { useOwnerNotesDelivery } from "../hooks/use-owner-notes-delivery";
import { NameOrTitleField } from "@/shared/components/name-or-title-field";
import { HeroName } from "@/shared/components/hero-name";
import {
  browseCardHeight,
  CARD_HEADER_NAME_SIZE_PX,
  CARD_PHOTO_SIZE_PX,
  CARD_PHOTO_TOP_PX,
  LIBRARY_NAME_FADE_PX,
  CARD_FOOTER_GAP_PX,
  CARD_HEADER_PAD_PX,
  CARD_TOP_TRIM_PX,
  HEADER_FADE_PX,
  RULE_GAP_PX,
  SECTION_PAD_PX,
  type MainScreenMode,
} from "../layout";

const HERO_PHOTO_PX = 128;

function cardIsReady(card: Card) {
  return Boolean(cardHasPhoto(card) && card.displayName.trim());
}

function EditorialHeader({
  card,
  positionTitle,
  reserveSheetMark,
  sheetMark,
  onPhotoChange,
  onDisplayNameChange,
  onCardUpdate,
  plate = false,
}: {
  card: Card;
  positionTitle?: string;
  /** The old counter line. The number now sits on the QR; this keeps the photo where it was. */
  reserveSheetMark?: boolean;
  /** An event card shows its pass line in that place. */
  sheetMark?: string;
  onPhotoChange?: (photo: string | null, file?: File) => void;
  onDisplayNameChange?: (displayName: string) => void;
  onCardUpdate?: (data: Partial<Card>) => void;
  /** Screen plate is one A under the photo. The PDF keeps the shorter pad. */
  plate?: boolean;
}) {
  const photoSrc = cardPhotoSrc(card);
  const setPhotoLook = onCardUpdate
    ? (look: "frame" | "shadow" | null) => onCardUpdate({ photoLook: look ?? undefined })
    : undefined;
  return (
    <div className="w-full">
      {sheetMark ? (
        <p className="m-0 mb-1 text-center t-label">{sheetMark}</p>
      ) : reserveSheetMark ? (
        <p aria-hidden className="invisible m-0 mb-1 text-right t-label">
          1
        </p>
      ) : null}
      <div
        className="relative"
        style={{
          paddingTop: RULE_GAP_PX - CARD_TOP_TRIM_PX,
          paddingBottom: plate ? CARD_HEADER_PAD_PX : CARD_HEADER_PAD_PX + HEADER_FADE_PX - SECTION_PAD_PX,
        }}
      >
        <div className="flex shrink-0 items-stretch gap-3" style={{ height: HERO_PHOTO_PX }}>
          {onPhotoChange ? (
            <PhotoSlotPicker
              photo={photoSrc}
              onPhotoChange={onPhotoChange}
              sizePx={HERO_PHOTO_PX}
              borderRadiusPx={0}
              photoLook={card.photoLook}
              onPhotoLook={setPhotoLook}
            />
          ) : photoSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              data-card-content
              src={photoSrc}
              alt=""
              fetchPriority="high"
              className={cn("size-[128px] shrink-0 object-cover", photoSlotLookClass(card.photoLook))}
            />
          ) : null}
          <div className="relative flex h-full min-w-0 flex-1 flex-col">
            <HeroName
              value={card.displayName}
              onChange={onDisplayNameChange}
              roleBelow={Boolean(positionTitle)}
            />
            {positionTitle ? (
              <p
                data-card-content
                className="m-0 line-clamp-3 min-w-0 shrink-0 overflow-hidden t-label"
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
  onCardUpdate,
}: {
  card: Card;
  onPhotoChange?: (photo: string | null, file?: File) => void;
  onDisplayNameChange?: (displayName: string) => void;
  onStartBlocked?: () => void;
  onCardUpdate?: (data: Partial<Card>) => void;
}) {
  const setPhotoLook = onCardUpdate
    ? (look: "frame" | "shadow" | null) => onCardUpdate({ photoLook: look ?? undefined })
    : undefined;
  return (
    <div className="flex w-full flex-col items-center" style={{ paddingTop: CARD_PHOTO_TOP_PX }}>
      {onPhotoChange ? (
        <PhotoSlotPicker
          photo={cardPhotoSrc(card)}
          onPhotoChange={onPhotoChange}
          sizePx={CARD_PHOTO_SIZE_PX}
          borderRadiusPx={0}
          onPickBlocked={onStartBlocked}
          photoLook={card.photoLook}
          onPhotoLook={setPhotoLook}
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
            className="text-center font-semibold tracking-[-1px] text-[var(--ink)]"
          />
        ) : (
          <p
            data-card-content
            className="text-center font-semibold tracking-[-1px] text-[var(--ink)]"
            style={{ fontSize: CARD_HEADER_NAME_SIZE_PX }}
          >
            {card.displayName}
          </p>
        )}
        {positionTitle ? (
          <p data-card-content className="mt-1 text-center t-label">
            {positionTitle}
            {positionCompany ? <span> · {positionCompany}</span> : null}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function PdfCard({
  card,
  items,
  positionTitle,
  readOnly,
  deliveredNotes,
  ownerNotes,
  pdfMask,
}: {
  card: Card;
  items: ContactItem[];
  positionTitle?: string;
  readOnly: boolean;
  deliveredNotes: DeliveredNote[];
  ownerNotes: Card["nextScanAddons"];
  pdfMask: number[] | null;
}) {
  const zoneIds = orderCardZones(composeCard(items, undefined, card).zones, card.rubricOrder).map((zone) => zone.id);
  const plan = pdfBlockPlan(zoneIds, pdfNotesPresent(readOnly ? deliveredNotes : ownerNotes));
  const shown = pdfMask ? plan.filter((_, index) => pdfMask.includes(index)) : plan;
  const zoneFilter = shown.flatMap((block) => (block.kind === "zone" ? [block.id] : []));
  return (
    <article data-pdf-card className="w-full shrink-0 bg-white text-[var(--ink)]">
      <div style={{ paddingLeft: PDF_PAD, paddingRight: PDF_PAD }}>
        {shown.some((block) => block.kind === "header") ? (
          <div data-pdf-block="">
            <EditorialHeader card={card} positionTitle={positionTitle} />
          </div>
        ) : null}
        {zoneFilter.length > 0 ? (
          <ContactItemChipList
            items={items}
            size="browse"
            underlineLinks
            publicToken={card.publicToken}
            rubricOrder={card.rubricOrder}
            rubricLabels={card.rubricLabels}
            itemZones={card.itemZones}
            markPdfBlocks
            pdfZoneIds={zoneFilter}
          />
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
            <div className="mt-4" style={{ marginLeft: -PDF_PAD, marginRight: -PDF_PAD }}>
              <AccountBand token={card.publicToken} inset={PDF_PAD} pdf />
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
  /** Print sheets of this same card. No QR, no share, no fixed screen height. */
  pdf?: boolean;
  /** Null paints every block. An array is one phone sheet. */
  pdfMask?: number[] | null;
  /** Place among the owner's portfolios. The counter is drawn on the QR. */
  sheetIndex?: number;
  sheetTotal?: number;
  /** A guest's event card: `{EVENT} · PASS` under the QR. The card counts as ready without a photo. */
  sheetMark?: string;
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
    pdf = false,
    pdfMask = null,
    sheetIndex,
    sheetTotal,
    sheetMark,
  },
  ref,
) {
  const setCardItemOrder = useAppStore((state) => state.setCardItemOrder);
  const setCardRubricOrder = useAppStore((state) => state.setCardRubricOrder);
  const setItemZone = useAppStore((state) => state.setItemZone);
  const items = getCardItems(card, library);
  const chosen = items.find((item) => item.id === card.headerItemId);
  const positionTitle = chosen?.value.trim() || card.title.trim() || undefined;
  const compact = mode === "library";
  const nextScanAddons = getNextScanAddons(card);
  const ready = cardIsReady(card) || Boolean(sheetMark);

  useOwnerNotesDelivery(card.id, !pdf && !readOnly && !compact && nextScanAddons.length > 0);
  const blank = !cardHasPhoto(card) && !card.displayName.trim();
  const showShareFooter =
    !readOnly && !compact && !editing && ready && (items.length > 0 || Boolean(card.publicToken));
  const bare = !compact && ready && items.length === 0 && !editing;
  const articleRef = useRef<HTMLElement | null>(null);
  const previewScrollRef = useRef<HTMLDivElement | null>(null);
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
        readOnly={readOnly}
        deliveredNotes={deliveredNotes}
        ownerNotes={nextScanAddons}
        pdfMask={pdfMask}
      />
    );
  }

  return (
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
      )}
      style={
        compact
          ? {
              height: libraryCardHeightPx,
              paddingTop: LIBRARY_NAME_FADE_PX,
            }
          : {
              height: readOnly ? "100%" : browseCardHeight(),
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
              onCardUpdate={onCardUpdate}
            />
          ) : (
            <EditorialHeader
              card={card}
              positionTitle={positionTitle}
              reserveSheetMark={ready && !readOnly && sheetIndex != null && sheetTotal != null}
              sheetMark={readOnly ? undefined : sheetMark}
              onPhotoChange={onPhotoChange}
              onDisplayNameChange={onDisplayNameChange}
              onCardUpdate={onCardUpdate}
              plate
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
              <p className="mt-5 max-w-[240px] bg-sky px-3 py-2.5 text-center t-meta text-[var(--ink)]">
                Add your contacts, links, professional details, social media, and files.
              </p>
            ) : null}
          </div>
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
        style={
          compact
            ? undefined
            : {
                WebkitMaskImage: `linear-gradient(to bottom, transparent 0, #000 ${HEADER_FADE_PX}px)`,
                maskImage: `linear-gradient(to bottom, transparent 0, #000 ${HEADER_FADE_PX}px)`,
              }
        }
        onScroll={compact ? syncPreviewFade : undefined}
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
      <div
        className={compact ? "contents" : undefined}
        style={compact ? undefined : { marginTop: -(SECTION_PAD_PX - HEADER_FADE_PX) }}
      >
      <ContactItemChipList
        items={items}
        size={compact ? "compact" : "browse"}
        className={compact ? "pb-2" : undefined}
        listId={card.id}
        rubricOrder={card.rubricOrder}
        rubricLabels={card.rubricLabels}
        itemZones={card.itemZones}
        canReorder={!compact && !readOnly && Boolean(onCardUpdate)}
        onReorder={compact || (!readOnly && onCardUpdate) ? handleCommitOrder : undefined}
        onReorderRubrics={
          !compact && !readOnly && onCardUpdate
            ? (keys) => setCardRubricOrder(card.id, keys)
            : undefined
        }
        onMoveItem={
          !compact && !readOnly && onCardUpdate
            ? (itemId, zoneId, orderedIds) => {
                setItemZone(card.id, itemId, zoneId);
                setCardItemOrder(card.id, orderedIds);
              }
            : undefined
        }
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
        publicToken={card.publicToken}
      />
      </div>
      )}

      {!compact && !editing ? (
        <NotesRubric
          ownerNotes={readOnly ? undefined : nextScanAddons}
          deliveredNotes={readOnly ? deliveredNotes : undefined}
        />
      ) : null}
      {!compact && !editing && (showShareFooter || shareFootnote) ? (
        <div
          className="mt-auto shrink-0 t-meta"
          style={{ paddingBottom: readOnly ? undefined : CARD_FOOTER_GAP_PX }}
        >
          {shareFootnote ? (
            <>
              <div aria-hidden className="h-[1lh]" />
              <div className="text-center">{shareFootnote}</div>
            </>
          ) : null}
        </div>
      ) : null}
      </div>
      </div>
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
  );
});

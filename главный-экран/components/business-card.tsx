"use client";

import { forwardRef, useCallback, useEffect, useLayoutEffect, useRef, useState, type MouseEvent, type ReactNode, type RefObject } from "react";
import { cn } from "@/lib/utils";
import type { Card, ContactItem } from "@/shared/types";
import type { DeliveredNote } from "@/shared/services/notes-types";
import { AccountBand } from "@/shared/components/account-band";
import { EmptyCardZones } from "./empty-card-zones";
import { TapButton } from "@/shared/components/tap-button";
import { cachedWalletStatus, cardInWallet, openWalletPass, walletIsConfigured } from "@/shared/lib/wallet-client";
import { composeCard, orderCardZones } from "@/shared/services/card-zones";
import { PDF_SIDE, pdfBlockPlan, pdfNotesPresent } from "@/shared/services/pdf-pages";
import { useAppStore } from "@/shared/store/app-store";
import { useUploadStatus } from "@/shared/store/upload-status";
import { openContactAttachmentPicker } from "@landing/components/photo-input-utils";
import { PhotoSlotPicker, photoSlotLookClass } from "@landing/components/photo-slot-picker";
import { shownPhotoLook } from "@/shared/lib/photo-look";
import { CardNameField } from "./card-name-field";
import { getCardItems, getNextScanAddons } from "@/shared/services/card-snapshot";
import { cardHasPhoto, cardPhotoSrc } from "@/shared/services/card-photo";
import { CardEditList } from "./card-edit-list";
import { ContactItemChipList } from "./contact-item-chip";
import { NotesRubric } from "./notes-rubric";
import { useOwnerNotesDelivery } from "../hooks/use-owner-notes-delivery";
import { useHeaderScale } from "../hooks/use-header-scale";
import { NameOrTitleField } from "@/shared/components/name-or-title-field";
import { HeroName } from "@/shared/components/hero-name";
import {
  browseCardHeight,
  editCardHeight,
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

/** Apple's registration arrives after the file opens. A few reads, then stop. */
const WALLET_RECHECK_MS = [2000, 6000, 12000, 20000];

/** Two white buttons under the card. Same shadow as the photo square. The gap is 12px. */
const CARD_BAR_SHADOW = "shadow-[0_2px_8px_rgba(17,17,17,0.16)]";
const CARD_BAR_BUTTON =
  "press flex w-0 min-w-0 flex-1 basis-0 items-center justify-center whitespace-nowrap border-0 bg-white px-[21.6px] py-[10.8px] t-caps text-[var(--ink)]";

/** Apple Wallet is an iPhone row. Android does not get the button or the status. */
function useAndroidDevice() {
  const [android, setAndroid] = useState(false);
  useLayoutEffect(() => {
    if (/Android/i.test(navigator.userAgent)) setAndroid(true);
  }, []);
  return android;
}

function useWalletOffer(cardId: string, enabled: boolean) {
  const android = useAndroidDevice();
  const [off, setOff] = useState(false);
  const [status, setStatus] = useState<"add" | "in">("add");
  const read = useRef(0);
  const pollGen = useRef(0);
  const polls = useRef<number[]>([]);
  const apply = useCallback((added: boolean | null) => {
    if (added === true) setStatus("in");
    else if (added === false) setStatus("add");
  }, []);
  useLayoutEffect(() => {
    if (!enabled) return;
    const known = cachedWalletStatus(cardId);
    setStatus(known === true ? "in" : "add");
  }, [cardId, enabled]);
  const refresh = useCallback(() => {
    if (!enabled) return;
    const ticket = ++read.current;
    void cardInWallet(cardId).then((added) => {
      if (ticket === read.current) apply(added);
    });
  }, [apply, cardId, enabled]);
  const watchRegistration = useCallback(() => {
    polls.current.forEach((id) => window.clearTimeout(id));
    const generation = ++pollGen.current;
    polls.current = WALLET_RECHECK_MS.map((delay) =>
      window.setTimeout(() => {
        if (generation !== pollGen.current) return;
        void cardInWallet(cardId).then((added) => {
          if (generation === pollGen.current && added === true) apply(true);
        });
      }, delay),
    );
  }, [apply, cardId]);
  useEffect(() => {
    if (!enabled) return;
    let returnTimer = 0;
    const readConfigured = () => {
      void walletIsConfigured().then((ready) => {
        if (ready === false) setOff(true);
        else if (ready === true) setOff(false);
      });
    };
    refresh();
    readConfigured();
    const onReturn = () => {
      if (document.visibilityState === "hidden") return;
      window.clearTimeout(returnTimer);
      returnTimer = window.setTimeout(() => {
        refresh();
        readConfigured();
      }, 300);
    };
    document.addEventListener("visibilitychange", onReturn);
    window.addEventListener("focus", onReturn);
    return () => {
      read.current += 1;
      pollGen.current += 1;
      window.clearTimeout(returnTimer);
      polls.current.forEach((id) => window.clearTimeout(id));
      polls.current = [];
      document.removeEventListener("visibilitychange", onReturn);
      window.removeEventListener("focus", onReturn);
    };
  }, [enabled, refresh]);
  const offer = !enabled || android || (off && status !== "in") ? null : status;
  return { offer, watchRegistration };
}

function OwnerCardBar({
  cardId,
  onEdit,
  showWallet,
  arranging,
  onDoneArrange,
}: {
  cardId: string;
  onEdit?: () => void;
  showWallet: boolean;
  arranging: boolean;
  onDoneArrange: () => void;
}) {
  const { offer, watchRegistration } = useWalletOffer(cardId, showWallet);
  if (!arranging && !onEdit && !offer) return null;
  const button = cn(CARD_BAR_BUTTON, CARD_BAR_SHADOW);
  return (
    <div className="flex w-full gap-3 py-[18px]" data-card-content>
      {arranging ? (
        <TapButton data-arrange-done="" data-no-swipe onTap={onDoneArrange} className={button}>
          Done
        </TapButton>
      ) : (
        <>
          {offer === "in" ? (
            <p className="m-0 flex w-0 min-w-0 flex-1 basis-0 items-center justify-center whitespace-nowrap px-[21.6px] py-[10.8px] t-caps text-[var(--grey)]">
              In Wallet
            </p>
          ) : offer === "add" ? (
            <TapButton
              data-no-swipe
              onTap={() => {
                void openWalletPass(`/api/cards/${encodeURIComponent(cardId)}/pass`).then((opened) => {
                  if (!opened) return;
                  watchRegistration();
                });
              }}
              className={button}
            >
              Add to Wallet
            </TapButton>
          ) : null}
          {onEdit ? (
            <TapButton data-no-swipe onTap={onEdit} className={button}>
              Edit info
            </TapButton>
          ) : null}
        </>
      )}
    </div>
  );
}

/** Name and photo stay on the live card. The rest of the sheet can paint a frame later. */
function useLiveFace(card: Card) {
  const displayName = useAppStore(
    (state) => (state.cards.find((entry) => entry.id === card.id) ?? card).displayName,
  );
  const photoSrc = useAppStore((state) => cardPhotoSrc(state.cards.find((entry) => entry.id === card.id) ?? card));
  const photoLook = useAppStore((state) => (state.cards.find((entry) => entry.id === card.id) ?? card).photoLook);
  return { displayName, photoSrc, photoLook };
}

function cardIsReady(card: Card) {
  return Boolean(card.displayName.trim());
}

function EditorialHeader({
  card,
  positionTitle,
  reserveSheetMark,
  sheetMark,
  onPhotoChange,
  onDisplayNameChange,
  nameLocked = false,
  onCardUpdate,
  plate = false,
  scale = 1,
  /** Network open: empty photo is a white square with the Profile shadow, not grey. */
  emptyPhotoShadow = false,
}: {
  card: Card;
  positionTitle?: string;
  /** The old counter line. The number now sits on the QR; this keeps the photo where it was. */
  reserveSheetMark?: boolean;
  /** An event card shows its pass line in that place. */
  sheetMark?: string;
  onPhotoChange?: (photo: string | null, file?: File) => void;
  onDisplayNameChange?: (displayName: string) => void;
  /** Outside Edit the name keeps its field but cannot be changed. */
  nameLocked?: boolean;
  onCardUpdate?: (data: Partial<Card>) => void;
  /** Screen plate is one A under the photo. The PDF keeps the shorter pad. */
  plate?: boolean;
  /** Compact screen: the photo and the gaps around it, below 1. */
  scale?: number;
  emptyPhotoShadow?: boolean;
}) {
  const face = useLiveFace(card);
  const photoSrc = face.photoSrc;
  const photoPx = HERO_PHOTO_PX * scale;
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
          paddingTop: (RULE_GAP_PX - CARD_TOP_TRIM_PX) * scale,
          paddingBottom: plate ? CARD_HEADER_PAD_PX * scale : CARD_HEADER_PAD_PX + HEADER_FADE_PX - SECTION_PAD_PX,
        }}
      >
        <div className="relative flex shrink-0 items-stretch gap-3" style={{ height: photoPx }}>
          {onPhotoChange ? (
            <PhotoSlotPicker
              photo={photoSrc}
              onPhotoChange={onPhotoChange}
              sizePx={photoPx}
              borderRadiusPx={0}
              photoLook={face.photoLook ?? "shadow"}
              onPhotoLook={setPhotoLook}
            />
          ) : photoSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              data-card-content
              src={photoSrc}
              alt=""
              fetchPriority="high"
              className={cn("shrink-0 object-cover", photoSlotLookClass(shownPhotoLook(face.photoLook)))}
              style={{ width: photoPx, height: photoPx }}
            />
          ) : emptyPhotoShadow ? (
            <span
              aria-hidden
              className={cn("shrink-0 bg-white", photoSlotLookClass("shadow"))}
              style={{ width: photoPx, height: photoPx }}
            />
          ) : (
            <span aria-hidden className="shrink-0 bg-[#f3f3f3]" style={{ width: photoPx, height: photoPx }} />
          )}
          <div className="relative flex h-full min-w-0 flex-1 flex-col">
            <HeroName
              value={face.displayName}
              onChange={onDisplayNameChange}
              locked={nameLocked}
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
  const face = useLiveFace(card);
  const setPhotoLook = onCardUpdate
    ? (look: "frame" | "shadow" | null) => onCardUpdate({ photoLook: look ?? undefined })
    : undefined;
  return (
    <div className="flex w-full flex-col items-center" style={{ paddingTop: CARD_PHOTO_TOP_PX }}>
      {onPhotoChange ? (
        <PhotoSlotPicker
          photo={face.photoSrc}
          onPhotoChange={onPhotoChange}
          sizePx={CARD_PHOTO_SIZE_PX}
          borderRadiusPx={0}
          onPickBlocked={onStartBlocked}
          photoLook={face.photoLook ?? "shadow"}
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
            value={face.displayName}
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
  const face = useLiveFace(card);
  return (
    <div className="flex w-full shrink-0 flex-col items-center">
      <div className="w-full text-center">
        {onDisplayNameChange ? (
          <CardNameField
            value={face.displayName}
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
            {face.displayName}
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
      <div style={{ paddingLeft: PDF_SIDE, paddingRight: PDF_SIDE }}>
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
            <div className="mt-4" style={{ marginLeft: -PDF_SIDE, marginRight: -PDF_SIDE }}>
              <AccountBand token={card.publicToken} inset={PDF_SIDE} pdf />
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
  onFill?: (zoneId: string, itemId?: string) => void;
  /** Guest event pass: the empty next section under the rows. */
  onAddNext?: () => void;
  composeOnMount?: boolean;
  /** Set only by a tap on an empty zone. Edit on the band does not pass it. */
  openZone?: string | null;
  /** The row a double tap asked to put the cursor in. */
  openItemId?: string | null;
  openAddRef?: RefObject<(() => void) | null>;
  onComposingChange?: (open: boolean) => void;
  /** Public /c/ page: same card, no QR, plus, or share link. */
  readOnly?: boolean;
  /** Sits on its own line under the portfolio name and share control. */
  shareFootnote?: ReactNode;
  /** One-time notes delivered to the first real viewer. */
  deliveredNotes?: DeliveredNote[];
  /** Trial add slide: same empty start, taps ask to register. */
  onPortfolioStartBlocked?: () => void;
  /** Owner card only. The Edit info half. Absent on a public card. */
  onEdit?: () => void;
  /** Print sheets of this same card. No QR, no share, no fixed screen height. */
  pdf?: boolean;
  /** Null paints every block. An array is one phone sheet. */
  pdfMask?: number[] | null;
  /** Place among the owner's portfolios. The counter is drawn on the QR. */
  sheetIndex?: number;
  sheetTotal?: number;
  /** A guest's event card: `{EVENT} · PASS` under the QR. The card counts as ready without a photo. */
  sheetMark?: string;
  /** False when the parent already applies the gutter, so the two layers are not stacked. */
  sidePad?: boolean;
  /** Network open only: empty photo slot is white with the default shadow. */
  emptyPhotoShadow?: boolean;
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
    onFill,
    onAddNext,
    composeOnMount = false,
    openZone = null,
    openItemId = null,
    openAddRef,
    onComposingChange,
    readOnly = false,
    shareFootnote,
    deliveredNotes = [],
    onPortfolioStartBlocked,
    onEdit,
    pdf = false,
    pdfMask = null,
    sheetIndex,
    sheetTotal,
    sheetMark,
    sidePad = true,
    emptyPhotoShadow = false,
  },
  ref,
) {
  const headerScale = useHeaderScale();
  const setCardItemOrder = useAppStore((state) => state.setCardItemOrder);
  const setCardRubricOrder = useAppStore((state) => state.setCardRubricOrder);
  const setItemZone = useAppStore((state) => state.setItemZone);
  const items = getCardItems(card, library);
  const chosen = library.find((item) => item.id === card.headerItemId);
  const positionTitle = chosen?.value.trim() || card.title.trim() || undefined;
  const compact = mode === "library";
  const nextScanAddons = getNextScanAddons(card);
  const ready = cardIsReady(card) || Boolean(sheetMark);

  useOwnerNotesDelivery(card.id, !pdf && !readOnly && !compact && nextScanAddons.length > 0);
  const blank = !cardHasPhoto(card) && !card.displayName.trim();
  const showShareFooter =
    !readOnly && !compact && !editing && ready && (items.length > 0 || Boolean(card.publicToken));
  const bare = !compact && ready && items.length === 0 && !editing;
  const [arranging, setArranging] = useState(false);
  const leaveArrangeRef = useRef<(() => void) | null>(null);
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

  const updateContactItemAttachment = useAppStore((state) => state.updateContactItemAttachment);
  const retryFile = useCallback(
    (itemId: string) => {
      openContactAttachmentPicker((dataUrl, file) => {
        const result = updateContactItemAttachment(card.id, itemId, file, dataUrl);
        if (!result.ok) useUploadStatus.getState().fail(itemId, result.message);
      });
    },
    [card.id, updateContactItemAttachment],
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
          : "card-scroll-spring relative min-h-0 overflow-hidden bg-white text-[#111] transition-[height] duration-[460ms] ease-out motion-reduce:transition-none",
      )}
      style={
        compact
          ? {
              height: libraryCardHeightPx,
              paddingTop: LIBRARY_NAME_FADE_PX,
            }
          : {
              height: readOnly ? "100%" : editing ? editCardHeight() : browseCardHeight(),
              touchAction: readOnly ? undefined : "manipulation",
            }
      }
    >
      {!compact ? (
        <div className={cn("shrink-0", sidePad && "px-[var(--gutter)]")}>
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
              nameLocked={!editing}
              onCardUpdate={onCardUpdate}
              plate
              scale={readOnly ? 1 : headerScale}
              emptyPhotoShadow={emptyPhotoShadow}
            />
          )}
        </div>
      ) : null}
      {bare && !readOnly ? (
        <div className={cn("compass-card-scroll min-h-0 flex-1 overflow-x-hidden overflow-y-auto", sidePad && "px-[var(--gutter)]")}>
          <div>
            <EmptyCardZones onOpenZone={!readOnly && onFill ? (zoneId) => onFill(zoneId) : undefined} />
            <NotesRubric ownerNotes={nextScanAddons} />
            {onEdit ? (
              <OwnerCardBar
                cardId={card.id}
                onEdit={onEdit}
                showWallet={false}
                arranging={false}
                onDoneArrange={() => {}}
              />
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
          compact && "compass-card-scroll w-full overflow-x-hidden overflow-y-auto",
          compact && sidePad && "px-[var(--gutter)]",
          !compact && "compass-card-scroll overflow-x-hidden overflow-y-auto",
          !compact && sidePad && "px-[var(--gutter)]",
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
          openZone={openZone}
          openItemId={openItemId}
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
                const item = library.find((entry) => entry.id === itemId);
                if (!item) return;
                onCardUpdate({ headerItemId: itemId, title: item.value.trim() });
              }
            : undefined
        }
        underlineLinks={readOnly}
        publicToken={card.publicToken}
        onRetryFile={!compact && !readOnly && onCardUpdate ? retryFile : undefined}
        onAddNext={!compact && !readOnly ? onAddNext : undefined}
        onOpenLine={!compact && !readOnly && !editing && onFill ? (zoneId, itemId) => onFill(zoneId, itemId) : undefined}
        onArrangeChange={!compact && !readOnly ? setArranging : undefined}
        leaveArrangeRef={!compact && !readOnly ? leaveArrangeRef : undefined}
      />
      </div>
      )}

      {!compact && !editing && !bare ? (
        <NotesRubric
          ownerNotes={readOnly ? undefined : nextScanAddons}
          deliveredNotes={readOnly ? deliveredNotes : undefined}
        />
      ) : null}
      {!bare && !compact && !editing && !readOnly ? (
        <OwnerCardBar
          cardId={card.id}
          onEdit={onEdit}
          showWallet={items.length > 0}
          arranging={arranging}
          onDoneArrange={() => leaveArrangeRef.current?.()}
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

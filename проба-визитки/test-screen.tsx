"use client";

import { Minus, Plus, X } from "lucide-react";
import { useCallback, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { PhotoSlotPicker } from "@landing/components/photo-slot-picker";
import { LibraryComposer } from "@main/components/library-composer";
import { NextScanMenu } from "@main/components/next-scan-menu";
import { QrZone } from "@main/components/qr-zone";
import { useMainLayout } from "@main/hooks/use-main-layout";
import { useShareSync } from "@main/hooks/use-share-sync";
import { layoutTop, RULE_GAP_PX } from "@main/layout";
import { cn } from "@/lib/utils";
import { NameOrTitleField } from "@/shared/components/name-or-title-field";
import { useLongPress } from "@/shared/hooks/use-long-press";
import { getNextScanAddons } from "@/shared/services/card-snapshot";
import { groupLibrary, isExplicitPosition, parseDescription, type CardDisplayRow, type CardZoneId } from "@/shared/services/card-zones";
import { isContactFilled } from "@/shared/services/contact-item";
import {
  canAddMoreCards,
  isCardReady,
  selectActiveCard,
  useAppStore,
} from "@/shared/store/app-store";
import type { Card, ContactItem } from "@/shared/types";

const HOLD_MS = 500;
const PHOTO_PX = 128;
const SIDE = "px-[calc(clamp(24px,6.1vw,28px)-1mm)]";
const OFF_CARD = "#C8C8C8";
const DELETE_RED = "#E23B2F";

type EditSection = {
  id: CardZoneId;
  title: string;
  included: boolean;
  rows: { row: CardDisplayRow; onCard: boolean }[];
};

function lineOf(row: CardDisplayRow) {
  return row.axis ? `${row.axis} / ${row.value}` : row.value;
}

function isHeaderRole(row: CardDisplayRow) {
  if (!row.item) return false;
  if (row.item.type === "position" || isExplicitPosition(row.item)) return true;
  if (row.item.type !== "text") return false;
  return Boolean(parseDescription(row.value).position);
}

function buildSections(card: Card, items: ContactItem[], editing: boolean): EditSection[] {
  const onCard = new Set(card.contactItemIds);
  const order = new Map(card.contactItemIds.map((id, index) => [id, index]));
  const grouped = groupLibrary(items.filter(isContactFilled));

  const sections = grouped.map((zone) => {
    const chosen = zone.rows
      .filter((row) => row.item && onCard.has(row.item.id))
      .sort((a, b) => (order.get(a.item!.id) ?? 0) - (order.get(b.item!.id) ?? 0));
    const spare = zone.rows
      .filter((row) => row.item && !onCard.has(row.item.id))
      .sort((a, b) => a.item!.order - b.item!.order);
    const included = chosen.length > 0;
    const rows = editing
      ? [...chosen.map((row) => ({ row, onCard: true })), ...spare.map((row) => ({ row, onCard: false }))]
      : chosen.map((row) => ({ row, onCard: true }));
    return { id: zone.id, title: zone.title, included, rows };
  });

  if (!editing) return sections.filter((section) => section.included);
  return [
    ...sections.filter((section) => section.included),
    ...sections.filter((section) => !section.included && section.rows.length > 0),
  ];
}

function HoldMark({
  onCard,
  onAdd,
  onRemove,
}: {
  onCard: boolean;
  onAdd: () => void;
  onRemove: () => void;
}) {
  const [holding, setHolding] = useState(false);
  const longPress = useLongPress(() => {
    setHolding(false);
    if (onCard) onRemove();
    else onAdd();
  }, HOLD_MS);
  const release = () => {
    setHolding(false);
    longPress.onPointerUp();
  };

  return (
    <button
      type="button"
      data-no-swipe
      aria-label={onCard ? "Hold to remove from card" : "Hold to add to card"}
      onPointerDown={(event) => {
        setHolding(true);
        longPress.onPointerDown(event);
      }}
      onPointerMove={longPress.onPointerMove}
      onPointerUp={release}
      onPointerCancel={release}
      onPointerLeave={release}
      onClick={longPress.onClick}
      onContextMenu={longPress.onContextMenu}
      className={cn(
        "flex size-5 shrink-0 items-center justify-center bg-transparent",
        holding && "scale-90",
      )}
    >
      {onCard ? (
        <Minus className="size-5 text-[#111]" strokeWidth={1} aria-hidden />
      ) : (
        <Plus className="size-5" strokeWidth={1} style={{ color: OFF_CARD }} aria-hidden />
      )}
    </button>
  );
}

export function TestCardScreen() {
  const cards = useAppStore((state) => state.cards);
  const currentCardIndex = useAppStore((state) => state.currentCardIndex);
  const contactItems = useAppStore((state) => state.contactItems);
  const shareToken = useAppStore((state) => state.user.shareToken);
  const setCurrentCardIndex = useAppStore((state) => state.setCurrentCardIndex);
  const updateCard = useAppStore((state) => state.updateCard);
  const updateSecondCardDraft = useAppStore((state) => state.updateSecondCardDraft);
  const addContactItem = useAppStore((state) => state.addContactItem);
  const updateContactItem = useAppStore((state) => state.updateContactItem);
  const updateContactItemAttachment = useAppStore((state) => state.updateContactItemAttachment);
  const addItemToCard = useAppStore((state) => state.addItemToCard);
  const removeItemFromCard = useAppStore((state) => state.removeItemFromCard);
  const setCardItemOrder = useAppStore((state) => state.setCardItemOrder);
  const deleteContactItem = useAppStore((state) => state.deleteContactItem);

  const card = selectActiveCard(cards, currentCardIndex);
  const layout = useMainLayout();
  useShareSync();

  const [editing, setEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteReadyId, setDeleteReadyId] = useState<string | null>(null);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const openedAt = useRef(0);

  const ready = Boolean(card && isCardReady(card));
  const sections = useMemo(
    () => (card ? buildSections(card, contactItems, editing) : []),
    [card, contactItems, editing],
  );
  const onCardCount = card?.contactItemIds.length ?? 0;
  const editingItem = editingId ? contactItems.find((item) => item.id === editingId) ?? null : null;
  const positionTitle = card
    ? contactItems.find((item) => item.id === card.headerItemId)?.value.trim() || undefined
    : undefined;

  const include = useCallback(
    (itemId: string) => {
      if (!card) return;
      addItemToCard(card.id, itemId);
      const next = useAppStore.getState().cards.find((entry) => entry.id === card.id);
      if (!next) return;
      const rest = next.contactItemIds.filter((id) => id !== itemId);
      setCardItemOrder(card.id, [...rest, itemId]);
    },
    [addItemToCard, card, setCardItemOrder],
  );

  const openComposer = () => {
    const id = addContactItem();
    if (!id) return;
    openedAt.current = Date.now();
    setAttachmentError(null);
    setEditingId(id);
    setEditing(true);
  };

  const onAddPress = () => {
    if (!card) return;
    const second = currentCardIndex > 0;
    const hasSpare = contactItems.some(
      (item) => isContactFilled(item) && !card.contactItemIds.includes(item.id),
    );
    if (second && hasSpare && !editing) {
      setEditing(true);
      return;
    }
    openComposer();
  };

  const closeComposer = () => {
    if (!editingId) return;
    if (Date.now() - openedAt.current < 450) return;
    const item = useAppStore.getState().contactItems.find((row) => row.id === editingId);
    if (item && !isContactFilled(item)) deleteContactItem(editingId);
    setEditingId(null);
  };

  const dots = useLongPress(() => {
    if (!ready) return;
    setEditing(true);
  }, HOLD_MS);

  const beginSwipe = (event: ReactPointerEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest("input, textarea, button, a")) return;
    const startX = event.clientX;
    const startY = event.clientY;
    const pointerId = event.pointerId;
    const up = (end: PointerEvent) => {
      if (end.pointerId !== pointerId) return;
      document.removeEventListener("pointerup", up);
      const dx = end.clientX - startX;
      const dy = end.clientY - startY;
      if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy)) return;
      if (dx < 0) {
        if (currentCardIndex < cards.length - 1) setCurrentCardIndex(currentCardIndex + 1);
        else if (canAddMoreCards(cards)) {
          updateSecondCardDraft({ displayName: "" });
          setCurrentCardIndex(1);
        }
      } else if (currentCardIndex > 0) {
        setCurrentCardIndex(currentCardIndex - 1);
      }
    };
    document.addEventListener("pointerup", up);
  };

  if (!card || !layout) {
    return <div className="fixed inset-0 bg-white" aria-hidden />;
  }

  const pdfUrl = `${typeof window === "undefined" ? "" : window.location.origin}/api/share/${shareToken}/pdf`;
  const showCenterPlus = ready && onCardCount === 0 && !editing && !editingItem;

  return (
    <main className="fixed inset-0 overflow-hidden bg-white text-[#111]" onPointerDown={beginSwipe}>
      <QrZone url={pdfUrl} visible={ready} topOffsetPx={layout.qrTop} />
      <article
        className="absolute flex flex-col overflow-hidden bg-white"
        style={{
          top: layoutTop(layout.cardTopBrowse),
          height: layout.browseCardHeight,
          left: layout.edgeInsetBrowse,
          right: layout.edgeInsetBrowse,
        }}
      >
        <div className={cn("shrink-0", SIDE)}>
          <div className="border-t-[0.5px] border-[#111]" />
          <div className="relative pb-[22px]" style={{ paddingTop: RULE_GAP_PX }}>
            <div className="flex items-stretch gap-2" style={{ height: PHOTO_PX }}>
              <PhotoSlotPicker
                photo={card.photo ?? null}
                onPhotoChange={(photo) => updateCard(card.id, { photo: photo ?? undefined })}
                sizePx={PHOTO_PX}
                borderRadiusPx={0}
              />
              <div className="relative flex h-full min-w-0 flex-1 flex-col justify-end">
                {card.photo ? (
                  <div className="absolute top-0 right-0 z-10">
                    <NextScanMenu
                      bare
                      addons={getNextScanAddons(card)}
                      onSetAddons={(addons) => updateCard(card.id, { nextScanAddons: addons })}
                    />
                  </div>
                ) : null}
                <NameOrTitleField
                  value={card.displayName}
                  onChange={(displayName) => updateCard(card.id, { displayName })}
                  fontSizePx={positionTitle ? 32 : 36}
                  className="font-semibold tracking-[-1px] text-[#111]"
                />
                {positionTitle ? (
                  <p className="mt-1 text-[11px] leading-none font-normal tracking-[0.2em] text-[#999] uppercase">
                    {positionTitle}
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        <div className="relative min-h-0 flex-1">
          <div
            className={cn("compass-card-scroll h-full overflow-x-hidden overflow-y-auto pb-16", SIDE)}
            onScroll={(event) => setScrolled(event.currentTarget.scrollTop > 2)}
          >
            {sections.map((section, index) => (
              <section
                key={section.id}
                className={cn(
                  "py-[18px]",
                  index < sections.length - 1 && "border-b-[0.5px] border-[#111]",
                )}
              >
                <div
                  className={cn(
                    "grid items-start gap-x-1.5",
                    editing ? "grid-cols-[86px_minmax(0,1fr)_26px]" : "grid-cols-[86px_minmax(0,1fr)]",
                  )}
                >
                  <span
                    className="pt-[4px] text-[11px] font-normal tracking-[0.1em] whitespace-nowrap uppercase"
                    style={{ color: section.included ? "#999" : OFF_CARD }}
                  >
                    {section.title}
                  </span>
                  <div className="contents">
                    {section.rows.map(({ row, onCard }, rowIndex) => {
                      const item = row.item;
                      if (!item) return null;
                      const text = lineOf(row);
                      return (
                        <Row
                          key={item.id}
                          item={item}
                          text={text}
                          onCard={onCard}
                          first={rowIndex === 0}
                          editing={editing}
                          deleteReady={deleteReadyId === item.id}
                          onArmDelete={() => setDeleteReadyId(item.id)}
                          onDelete={() => {
                            setDeleteReadyId(null);
                            deleteContactItem(item.id);
                          }}
                          onAdd={() => include(item.id)}
                          onRemove={() => removeItemFromCard(card.id, item.id)}
                          onChoose={
                            isHeaderRole(row)
                              ? () => updateCard(card.id, { headerItemId: item.id, title: item.value.trim() })
                              : undefined
                          }
                        />
                      );
                    })}
                  </div>
                </div>
              </section>
            ))}

            {editingItem ? (
              <div className="py-3">
                <LibraryComposer
                  item={editingItem}
                  attachmentError={attachmentError}
                  onValueChange={(value) => updateContactItem(editingItem.id, { value })}
                  onLabelChange={(label) => updateContactItem(editingItem.id, { label })}
                  onAttachment={(file, dataUrl) => {
                    const result = updateContactItemAttachment(card.id, editingItem.id, file, dataUrl);
                    if (!result.ok) setAttachmentError(result.message);
                    else setAttachmentError(null);
                  }}
                  onBlur={closeComposer}
                />
              </div>
            ) : null}

            {showCenterPlus ? (
              <div className="flex justify-center py-10">
                <AddButton onClick={onAddPress} />
              </div>
            ) : null}

            {editing && !editingItem ? (
              <div className="flex justify-center py-6">
                <AddButton onClick={openComposer} />
              </div>
            ) : null}
          </div>
          {scrolled ? (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 z-10 h-10 bg-gradient-to-b from-white to-transparent"
            />
          ) : null}
        </div>
      </article>

      {ready && !editing ? (
        <button
          type="button"
          aria-label="Hold to edit"
          className="absolute left-1/2 z-30 flex -translate-x-1/2 -translate-y-1/2 items-center gap-2 px-3 py-2"
          style={{ top: layoutTop(layout.browseMenuCenterY) }}
          onPointerDown={dots.onPointerDown}
          onPointerMove={dots.onPointerMove}
          onPointerUp={dots.onPointerUp}
          onPointerCancel={dots.onPointerCancel}
          onPointerLeave={dots.onPointerLeave}
          onClick={dots.onClick}
          onContextMenu={dots.onContextMenu}
        >
          <span className="size-[9.2px] rounded-full border border-[#D8D2C4]" />
          <span className="size-[9.2px] rounded-full border border-[#D8D2C4]" />
        </button>
      ) : null}

      {editing ? (
        <button
          type="button"
          className="absolute left-1/2 z-30 -translate-x-1/2 -translate-y-1/2 px-4 py-2 text-[11px] font-normal tracking-[0.1em] text-[#111] uppercase"
          style={{ top: layoutTop(layout.browseMenuCenterY) }}
          onClick={() => {
            setEditing(false);
            setDeleteReadyId(null);
          }}
        >
          OK
        </button>
      ) : null}
    </main>
  );
}

function AddButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      data-no-swipe
      aria-label="Add"
      onClick={onClick}
      className="flex size-5 items-center justify-center bg-transparent"
    >
      <Plus className="size-5 text-[#111]" strokeWidth={1} aria-hidden />
    </button>
  );
}

function Row({
  item,
  text,
  onCard,
  first,
  editing,
  deleteReady,
  onArmDelete,
  onDelete,
  onAdd,
  onRemove,
  onChoose,
}: {
  item: ContactItem;
  text: string;
  onCard: boolean;
  first: boolean;
  editing: boolean;
  deleteReady: boolean;
  onArmDelete: () => void;
  onDelete: () => void;
  onAdd: () => void;
  onRemove: () => void;
  onChoose?: () => void;
}) {
  const [holding, setHolding] = useState(false);
  const longPress = useLongPress(() => {
    setHolding(false);
    window.getSelection()?.removeAllRanges();
    onArmDelete();
  }, HOLD_MS);
  const release = () => {
    setHolding(false);
    longPress.onPointerUp();
  };
  const placed = first ? "" : "col-start-2";

  return (
    <>
      <button
        type="button"
        className={cn(
          "min-w-0 py-[3px] text-left text-[15.5px] leading-[1.45] font-normal tracking-[-0.015em] break-words",
          placed,
          holding && "opacity-40",
        )}
        style={{ color: onCard ? "#111" : OFF_CARD }}
        onPointerDown={(event) => {
          if (!editing || deleteReady) return;
          setHolding(true);
          longPress.onPointerDown(event);
        }}
        onPointerMove={longPress.onPointerMove}
        onPointerUp={release}
        onPointerCancel={release}
        onPointerLeave={release}
        onClick={(event) => {
          longPress.onClick(event);
          if (event.defaultPrevented || deleteReady) return;
          onChoose?.();
        }}
        onContextMenu={longPress.onContextMenu}
      >
        {text}
      </button>
      {editing ? (
        <div className="flex items-center justify-end">
          {deleteReady ? (
            <button type="button" aria-label="Delete" onClick={onDelete} className="flex size-5 items-center justify-center">
              <X className="size-4" strokeWidth={1.5} style={{ color: DELETE_RED }} aria-hidden />
            </button>
          ) : (
            <HoldMark onCard={onCard} onAdd={onAdd} onRemove={onRemove} />
          )}
        </div>
      ) : null}
    </>
  );
}

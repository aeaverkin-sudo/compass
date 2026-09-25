"use client";

import { Minus, Plus, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { BusinessCard } from "@main/components/business-card";
import { LibraryComposer } from "@main/components/library-composer";
import { QrZone } from "@main/components/qr-zone";
import { useMainLayout } from "@main/hooks/use-main-layout";
import { useShareSync } from "@main/hooks/use-share-sync";
import { layoutTop } from "@main/layout";
import { cn } from "@/lib/utils";
import { useLongPress } from "@/shared/hooks/use-long-press";
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
  const openedAt = useRef(0);

  const ready = Boolean(card && isCardReady(card));
  const sections = useMemo(
    () => (card ? buildSections(card, contactItems, editing) : []),
    [card, contactItems, editing],
  );
  const editingItem = editingId ? contactItems.find((item) => item.id === editingId) ?? null : null;

  useEffect(() => {
    if (!deleteReadyId) return;
    const dismiss = (event: Event) => {
      const target = event.target;
      if (target instanceof Element && target.closest("[data-delete-marker]")) return;
      setDeleteReadyId(null);
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [deleteReadyId]);

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

  return (
    <main className="fixed inset-0 overflow-hidden bg-white text-[#111]" onPointerDown={beginSwipe}>
      <QrZone url={pdfUrl} visible={ready} topOffsetPx={layout.qrTop} />
      <div
        className="absolute overflow-hidden"
        style={{
          top: layoutTop(layout.cardTopBrowse),
          left: layout.edgeInsetBrowse,
          right: layout.edgeInsetBrowse,
          zIndex: 20,
        }}
      >
        <BusinessCard
          card={card}
          library={contactItems}
          mode="browse"
          onEmptyAreaTap={() => undefined}
          onPhotoChange={(photo) => updateCard(card.id, { photo: photo ?? undefined })}
          onDisplayNameChange={(displayName) => updateCard(card.id, { displayName })}
          onCardUpdate={(data) => updateCard(card.id, data)}
          browseList={
            editing ? (
              <div>
                {sections.map((section, index) => (
                  <section
                    key={section.id}
                    className={cn(
                      "py-[18px]",
                      index < sections.length - 1 && "border-b-[0.5px] border-[#111]",
                    )}
                  >
                    <div className="grid grid-cols-[86px_minmax(0,1fr)_26px] items-start gap-x-1.5">
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
                          return (
                            <Row
                              key={item.id}
                              item={item}
                              text={lineOf(row)}
                              onCard={onCard}
                              first={rowIndex === 0}
                              editing
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
                  <div className="mt-2 border-t-[0.5px] border-[#111] py-3">
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
                ) : (
                  <div className="mt-2 flex justify-center border-t-[0.5px] border-[#111] pt-6 pb-2">
                    <AddButton onClick={openComposer} />
                  </div>
                )}
              </div>
            ) : undefined
          }
        />
      </div>

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
      className="flex size-7 items-center justify-center bg-transparent"
    >
      <Plus className="size-7 text-[#111]" strokeWidth={1} aria-hidden />
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
          "min-w-0 py-[3px] text-left text-[15.5px] leading-[1.45] font-normal tracking-[-0.015em] break-words select-none [-webkit-touch-callout:none]",
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
            <button type="button" data-delete-marker aria-label="Delete" onClick={onDelete} className="flex size-5 items-center justify-center">
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

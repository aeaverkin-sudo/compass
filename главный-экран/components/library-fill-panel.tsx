"use client";

import { Minus, Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
  isContactFilled,
  isItemOnCard,
  itemDisplayValue,
  rowTypeLabel,
  sortContactList,
} from "@/shared/services/contact-item";
import { useAppStore } from "@/shared/store/app-store";
import type { Card, ContactItem } from "@/shared/types";
import { useVisualViewport } from "@landing/hooks/use-visual-viewport";
import { LibraryComposer } from "./library-composer";

const MENU_BUTTON_HALF_PX = 22;
const LIST_GAP_PX = 8;
const COMPOSER_LIST_GAP_PX = 8;
const FILL_ICON_STROKE = 1;

type LibraryFillPanelProps = {
  card: Card;
  panelTopPx: number;
  menuCenterYpx: number;
  contentWidthPx?: number;
  onComposerOpenChange?: (open: boolean) => void;
};

function CardToggleButton({
  onCard,
  onAdd,
  onRemove,
}: {
  onCard: boolean;
  onAdd: () => void;
  onRemove: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={onCard ? "Remove from card" : "Add to card"}
      onClick={onCard ? onRemove : onAdd}
      className={cn(
        "flex size-[22px] shrink-0 items-center justify-center rounded-full border bg-sheet transition-opacity active:opacity-60",
        onCard ? "border-[rgba(20,20,20,0.55)]" : "border-[#D8D5CC]",
      )}
    >
      {onCard ? (
        <Minus className="size-3 text-foreground" strokeWidth={FILL_ICON_STROKE} aria-hidden />
      ) : (
        <Plus className="size-3 text-label" strokeWidth={FILL_ICON_STROKE} aria-hidden />
      )}
    </button>
  );
}

function FilledRow({
  item,
  onCard,
  onEdit,
  onAdd,
  onRemove,
}: {
  item: ContactItem;
  onCard: boolean;
  onEdit: () => void;
  onAdd: () => void;
  onRemove: () => void;
}) {
  const label = rowTypeLabel(item);

  return (
    <li className="col-span-3 grid grid-cols-subgrid items-stretch py-4">
      {label ? (
        <span className="flex items-center justify-start whitespace-nowrap text-left text-[13px] font-normal leading-[1.4] text-label">
          {label}
        </span>
      ) : (
        <span aria-hidden />
      )}
      <button
        type="button"
        onClick={onEdit}
        className={cn(
          "flex w-full min-w-0 items-center overflow-hidden text-left text-[15px] leading-[1.5]",
          onCard ? "font-semibold text-foreground" : "font-normal text-label",
        )}
      >
        <span className="min-w-0 w-full whitespace-normal wrap-anywhere break-words">
          {itemDisplayValue(item)}
        </span>
      </button>
      <div className="relative z-10 flex items-center justify-center">
        <CardToggleButton onCard={onCard} onAdd={onAdd} onRemove={onRemove} />
      </div>
    </li>
  );
}

export function LibraryFillPanel({
  card,
  panelTopPx,
  menuCenterYpx,
  contentWidthPx,
  onComposerOpenChange,
}: LibraryFillPanelProps) {
  const contactItems = useAppStore((state) => state.contactItems);
  const addContactItem = useAppStore((state) => state.addContactItem);
  const updateContactItem = useAppStore((state) => state.updateContactItem);
  const updateContactItemAttachment = useAppStore((state) => state.updateContactItemAttachment);
  const addItemToCard = useAppStore((state) => state.addItemToCard);
  const removeItemFromCard = useAppStore((state) => state.removeItemFromCard);
  const deleteContactItem = useAppStore((state) => state.deleteContactItem);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const composerOpenedAt = useRef(0);
  const { keyboardOpen } = useVisualViewport();

  const rows = useMemo(
    () => sortContactList(contactItems, card.contactItemIds),
    [contactItems, card.contactItemIds],
  );
  const filledRows = useMemo(() => rows.filter((item) => isContactFilled(item)), [rows]);
  const contentZoneHeight = Math.max(
    0,
    menuCenterYpx - panelTopPx - MENU_BUTTON_HALF_PX - LIST_GAP_PX,
  );

  const editingItem = useMemo(
    () => (editingId ? contactItems.find((item) => item.id === editingId) ?? null : null),
    [contactItems, editingId],
  );
  const composerOpen = editingItem !== null;

  const openComposer = useCallback((itemId: string) => {
    composerOpenedAt.current = Date.now();
    setAttachmentError(null);
    setEditingId(itemId);
  }, []);

  // Add a draft to the library pool (never straight onto the card) and edit it.
  const handleAddRow = () => {
    const draftId = addContactItem();
    if (draftId) openComposer(draftId);
  };

  const handleComposerBlur = useCallback(() => {
    if (!editingId) return;
    if (Date.now() - composerOpenedAt.current < 450) return;

    const item = useAppStore.getState().contactItems.find((row) => row.id === editingId);
    if (item && !isContactFilled(item)) {
      deleteContactItem(editingId);
    }
    setEditingId(null);
  }, [deleteContactItem, editingId]);

  useEffect(() => {
    onComposerOpenChange?.(composerOpen);
  }, [composerOpen, onComposerOpenChange]);

  useEffect(() => {
    return () => onComposerOpenChange?.(false);
  }, [onComposerOpenChange]);

  const listWidthStyle = contentWidthPx ? { width: contentWidthPx } : undefined;

  return (
    <div className="compass-library-panel-bottom relative flex min-h-0 flex-1 flex-col">
      {composerOpen && editingItem ? (
        <div
          className={cn(
            "mx-auto flex w-full justify-center",
            keyboardOpen ? "pointer-events-none h-0 overflow-hidden" : "shrink-0",
          )}
          style={
            keyboardOpen
              ? undefined
              : { ...listWidthStyle, marginBottom: COMPOSER_LIST_GAP_PX }
          }
          aria-hidden={keyboardOpen}
        >
          <LibraryComposer
            item={editingItem}
            contentWidthPx={contentWidthPx}
            attachmentError={attachmentError}
            onValueChange={(value) => updateContactItem(editingItem.id, { value })}
            onAttachment={(file, dataUrl) => {
              const result = updateContactItemAttachment(card.id, editingItem.id, file, dataUrl);
              if (!result.ok) {
                setAttachmentError(result.message);
                return;
              }
              setAttachmentError(null);
            }}
            onBlur={handleComposerBlur}
          />
        </div>
      ) : null}

      {!composerOpen ? (
      <div
        className="compass-library-list mx-auto flex min-h-0 flex-col overflow-hidden px-4"
        style={{
          height: contentZoneHeight,
          maxHeight: contentZoneHeight,
          ...listWidthStyle,
        }}
      >
        <div className="flex min-h-0 flex-1 flex-col">
          {filledRows.length > 0 ? (
            <ul className="grid min-h-0 flex-1 auto-rows-min grid-cols-[auto_minmax(0,1fr)_28px] gap-x-2 divide-y divide-divider overflow-y-auto">
              {filledRows.map((item) => (
                <FilledRow
                  key={item.id}
                  item={item}
                  onCard={isItemOnCard(card, item.id)}
                  onEdit={() => openComposer(item.id)}
                  onAdd={() => addItemToCard(card.id, item.id)}
                  onRemove={() => removeItemFromCard(card.id, item.id)}
                />
              ))}
            </ul>
          ) : (
            <div className="min-h-0 flex-1" aria-hidden />
          )}

          <div className="flex shrink-0 justify-center pb-4">
            <button
              type="button"
              aria-label="Add contact row"
              onClick={handleAddRow}
              className={cn(
                "compass-icon-circle size-10 shrink-0 transition-opacity active:opacity-60",
                filledRows.length > 0 && "mt-2",
              )}
            >
              <Plus className="size-5 text-label" strokeWidth={FILL_ICON_STROKE} aria-hidden />
            </button>
          </div>
        </div>
      </div>
      ) : null}
    </div>
  );
}

"use client";

import { Minus, Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import {
  isContactFilled,
  isItemOnCard,
  rowTypeLabel,
  sortContactList,
} from "@/shared/services/contact-item";
import { useAppStore } from "@/shared/store/app-store";
import type { Card, ContactItem } from "@/shared/types";
import { LibraryComposer } from "./library-composer";

const MENU_BUTTON_HALF_PX = 22;
const FILL_ICON_STROKE = 1;

type LibraryFillPanelProps = {
  card: Card;
  panelTopPx: number;
  menuCenterYpx: number;
};

function CardToggleButton({
  item,
  onCard,
  onAdd,
  onRemove,
}: {
  item: ContactItem;
  onCard: boolean;
  onAdd: () => void;
  onRemove: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={onCard ? "Remove from card" : "Add to card"}
      onClick={onCard ? onRemove : onAdd}
      className="flex size-7 shrink-0 items-center justify-center transition-opacity active:opacity-60"
    >
      {onCard ? (
        <Minus className="size-4 text-hairline" strokeWidth={FILL_ICON_STROKE} aria-hidden />
      ) : (
        <Plus className="size-4 text-hairline" strokeWidth={FILL_ICON_STROKE} aria-hidden />
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
    <li
      className="grid grid-cols-[28px_72px_minmax(0,1fr)] items-center gap-x-2 py-2.5"
    >
      <CardToggleButton item={item} onCard={onCard} onAdd={onAdd} onRemove={onRemove} />
      {label ? (
        <span className="truncate text-[13px] leading-none text-hint">{label}</span>
      ) : (
        <span aria-hidden />
      )}
      <button
        type="button"
        onClick={onEdit}
        className="min-w-0 truncate text-left text-[15px] font-semibold leading-[1.35] text-foreground"
      >
        {item.value}
      </button>
    </li>
  );
}

export function LibraryFillPanel({ card, panelTopPx, menuCenterYpx }: LibraryFillPanelProps) {
  const contactItems = useAppStore((state) => state.contactItems);
  const addContactItemForCard = useAppStore((state) => state.addContactItemForCard);
  const updateContactItem = useAppStore((state) => state.updateContactItem);
  const updateContactItemAttachment = useAppStore((state) => state.updateContactItemAttachment);
  const addItemToCard = useAppStore((state) => state.addItemToCard);
  const removeItemFromCard = useAppStore((state) => state.removeItemFromCard);
  const deleteContactItem = useAppStore((state) => state.deleteContactItem);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);

  const rows = useMemo(
    () => sortContactList(contactItems, card.contactItemIds),
    [contactItems, card.contactItemIds],
  );
  const filledRows = useMemo(() => rows.filter((item) => isContactFilled(item)), [rows]);
  const contentZoneHeight = Math.max(0, menuCenterYpx - panelTopPx - MENU_BUTTON_HALF_PX);
  const canAddRow = !contactItems.some((item) => !isContactFilled(item));

  const editingItem = useMemo(
    () => (editingId ? contactItems.find((item) => item.id === editingId) ?? null : null),
    [contactItems, editingId],
  );
  const composerOpen = editingItem !== null;

  const handleAddRow = () => {
    if (!canAddRow) return;
    if (addContactItemForCard(card.id)) {
      const draft = useAppStore
        .getState()
        .contactItems.find((item) => !isContactFilled(item));
      if (draft) setEditingId(draft.id);
    }
  };

  const handleRemoveRow = (item: ContactItem) => {
    if (!isContactFilled(item)) {
      deleteContactItem(item.id);
      return;
    }
    removeItemFromCard(card.id, item.id);
  };

  const handleComposerBlur = useCallback(() => {
    if (!editingId) return;

    const item = useAppStore.getState().contactItems.find((row) => row.id === editingId);
    if (item && !isContactFilled(item)) {
      deleteContactItem(editingId);
    }
    setEditingId(null);
  }, [deleteContactItem, editingId]);

  useEffect(() => {
    if (!composerOpen) return;
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, [composerOpen]);

  return (
    <div className="compass-library-panel-bottom relative min-h-0 flex-1">
      <div
        className="absolute inset-x-0 top-0 flex flex-col items-center justify-center overflow-y-auto px-4"
        style={{ height: contentZoneHeight }}
      >
        {!composerOpen ? (
          <div className="flex w-full max-w-[360px] flex-col items-center">
            {filledRows.length > 0 ? (
              <ul className="w-full divide-y divide-hairline/25">
                {filledRows.map((item) => (
                  <FilledRow
                    key={item.id}
                    item={item}
                    onCard={isItemOnCard(card, item.id)}
                    onEdit={() => setEditingId(item.id)}
                    onAdd={() => addItemToCard(card.id, item.id)}
                    onRemove={() => handleRemoveRow(item)}
                  />
                ))}
              </ul>
            ) : null}

            <button
              type="button"
              aria-label="Add contact row"
              disabled={!canAddRow}
              onClick={handleAddRow}
              className={cn(
                "flex size-10 shrink-0 items-center justify-center transition-opacity active:opacity-60",
                filledRows.length > 0 && "mt-2",
                !canAddRow && "cursor-default opacity-40",
              )}
            >
              <Plus className="size-6 text-hairline" strokeWidth={FILL_ICON_STROKE} aria-hidden />
            </button>
          </div>
        ) : null}
      </div>

      {composerOpen && editingItem ? (
        <LibraryComposer
          item={editingItem}
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
      ) : null}
    </div>
  );
}

"use client";

import { Minus, Plus } from "lucide-react";
import { useMemo } from "react";
import { cn } from "@/lib/utils";
import {
  EMPTY_CONTACT_PLACEHOLDER,
  isContactFilled,
  isItemOnCard,
  sortContactList,
  typeLabel,
} from "@/shared/services/contact-item";
import { useAppStore } from "@/shared/store/app-store";
import type { Card, ContactItem } from "@/shared/types";
import { QR_COLOR } from "../layout";

const MENU_BUTTON_HALF_PX = 22;

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
  if (!isContactFilled(item)) return <span className="inline-block size-7 shrink-0" aria-hidden />;

  return (
    <button
      type="button"
      aria-label={onCard ? "Remove from card" : "Add to card"}
      onClick={onCard ? onRemove : onAdd}
      className="flex size-7 shrink-0 items-center justify-center transition-opacity active:opacity-60"
    >
      {onCard ? (
        <Minus className="size-4" strokeWidth={2.5} style={{ color: QR_COLOR }} aria-hidden />
      ) : (
        <Plus className="size-4" strokeWidth={2.5} style={{ color: QR_COLOR }} aria-hidden />
      )}
    </button>
  );
}

export function LibraryFillPanel({ card, panelTopPx, menuCenterYpx }: LibraryFillPanelProps) {
  const contactItems = useAppStore((state) => state.contactItems);
  const addContactItemForCard = useAppStore((state) => state.addContactItemForCard);
  const updateContactItem = useAppStore((state) => state.updateContactItem);
  const addItemToCard = useAppStore((state) => state.addItemToCard);
  const removeItemFromCard = useAppStore((state) => state.removeItemFromCard);
  const deleteContactItem = useAppStore((state) => state.deleteContactItem);

  const rows = useMemo(
    () => sortContactList(contactItems, card.contactItemIds),
    [contactItems, card.contactItemIds],
  );
  const contentZoneHeight = Math.max(0, menuCenterYpx - panelTopPx - MENU_BUTTON_HALF_PX);
  const canAddRow = !contactItems.some((item) => !isContactFilled(item));

  const handleAddRow = () => {
    addContactItemForCard(card.id);
  };

  const handleRemoveRow = (item: ContactItem) => {
    if (!isContactFilled(item)) {
      deleteContactItem(item.id);
      return;
    }
    removeItemFromCard(card.id, item.id);
  };

  return (
    <div className="compass-library-panel-bottom relative min-h-0 flex-1">
      <div
        className="absolute inset-x-0 top-0 flex flex-col items-center justify-center overflow-y-auto px-4"
        style={{ height: contentZoneHeight }}
      >
        <div className="flex w-full max-w-[360px] flex-col items-center">
          {rows.length > 0 ? (
            <ul className="w-full divide-y divide-hairline/25">
              {rows.map((item) => {
                const filled = isContactFilled(item);
                const onCard = isItemOnCard(card, item.id);
                const label = typeLabel(item.type);

                return (
                  <li
                    key={item.id}
                    className="grid grid-cols-[28px_72px_minmax(0,1fr)] items-center gap-x-2 py-2.5"
                  >
                    <CardToggleButton
                      item={item}
                      onCard={onCard}
                      onAdd={() => addItemToCard(card.id, item.id)}
                      onRemove={() => handleRemoveRow(item)}
                    />
                    <span
                      className={cn(
                        "truncate text-[13px] leading-none",
                        filled ? "text-hint" : "text-hint/70",
                      )}
                    >
                      {label}
                    </span>
                    <input
                      type="text"
                      value={item.value}
                      placeholder={EMPTY_CONTACT_PLACEHOLDER}
                      aria-label={label || "Contact field"}
                      onChange={(event) => updateContactItem(item.id, { value: event.target.value })}
                      className={cn(
                        "compass-input min-w-0 bg-transparent text-left text-[15px] leading-[1.35] text-foreground outline-none",
                        "placeholder:font-normal placeholder:text-hint",
                        filled && "font-semibold",
                      )}
                    />
                  </li>
                );
              })}
            </ul>
          ) : null}

          <button
            type="button"
            aria-label="Add contact row"
            disabled={!canAddRow}
            onClick={handleAddRow}
            className={cn(
              "flex size-10 shrink-0 items-center justify-center transition-opacity active:opacity-60",
              rows.length > 0 && "mt-2",
              !canAddRow && "cursor-default opacity-40",
            )}
          >
            <Plus className="size-6" strokeWidth={2.25} style={{ color: QR_COLOR }} aria-hidden />
          </button>
        </div>
      </div>
    </div>
  );
}

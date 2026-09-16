"use client";

import { useMemo } from "react";
import type { Card, ContactItem } from "@/shared/types";
import { isContactFilled, sortContactList, typeLabel } from "@/features/portfolio/services/contact-item";
import { EditorRow } from "./editor-row";

interface DataLayerProps {
  card: Card;
  library: ContactItem[];
  editing: boolean;
  onAddItem: () => void;
  onUpdateItem: (id: string, data: Partial<ContactItem>) => void;
  onToggleActive: (itemId: string) => void;
}

function PeekRow({
  item,
  isActive,
}: {
  item: ContactItem;
  isActive: boolean;
}) {
  const displayValue = item.value.replace(/^https?:\/\//, "").replace(/^www\./, "");

  return (
    <div className="flex min-h-[44px] items-center gap-3 border-b border-[#f0f0f0] py-2">
      <span
        className={`w-[88px] shrink-0 text-[13px] ${
          isActive ? "font-medium text-[#1a1a1a]" : "text-[#aaa]"
        }`}
      >
        {typeLabel(item.type)}
      </span>
      <span
        className={`min-w-0 flex-1 break-words text-[13px] leading-snug ${
          isActive ? "font-semibold text-[#1a1a1a]" : "text-[#bbb]"
        }`}
      >
        {displayValue}
      </span>
      <span
        className={`shrink-0 text-[18px] font-light leading-none ${
          isActive ? "text-[#1a1a1a]" : "text-[#ccc]"
        }`}
      >
        {isActive ? "−" : "+"}
      </span>
    </div>
  );
}

export function DataLayer({
  card,
  library,
  editing,
  onAddItem,
  onUpdateItem,
  onToggleActive,
}: DataLayerProps) {
  const filled = useMemo(() => library.filter(isContactFilled), [library]);
  const draft = useMemo(() => library.find((i) => !isContactFilled(i)), [library]);

  const sorted = useMemo(
    () => sortContactList(filled, card.contactItemIds),
    [filled, card.contactItemIds],
  );

  if (editing) {
    return (
      <div
        data-wheel-scroll
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-4 scrollbar-hide"
        style={{ paddingBottom: "calc(20px + env(safe-area-inset-bottom))" }}
      >
        {sorted.map((item) => (
          <EditorRow
            key={item.id}
            item={item}
            isActive={card.contactItemIds.includes(item.id)}
            isEmpty={false}
            onUpdate={(data) => onUpdateItem(item.id, data)}
            onToggleActive={() => onToggleActive(item.id)}
          />
        ))}

        {draft && (
          <EditorRow
            key={draft.id}
            item={draft}
            isActive={false}
            isEmpty
            autoEdit
            onUpdate={(data) => onUpdateItem(draft.id, data)}
            onToggleActive={() => onToggleActive(draft.id)}
          />
        )}

        {!draft && (
          <div className="flex justify-center py-4">
            <button
              type="button"
              onClick={onAddItem}
              className="text-[24px] font-light leading-none text-[#1a1a1a]"
              aria-label="Add new item"
            >
              +
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="px-5 pb-3 pt-1">
      {sorted.map((item) => (
        <PeekRow
          key={item.id}
          item={item}
          isActive={card.contactItemIds.includes(item.id)}
        />
      ))}
      {!draft && (
        <div className="flex justify-center py-3">
          <span className="text-[22px] font-light leading-none text-[#ccc]">+</span>
        </div>
      )}
    </div>
  );
}

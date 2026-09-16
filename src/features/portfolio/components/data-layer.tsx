"use client";

import { useMemo } from "react";
import type { Card, ContactItem } from "@/shared/types";
import {
  isContactFilled,
  sortContactList,
  typeLabel,
} from "@/features/portfolio/services/contact-item";
import { ContactIcon } from "./contact-icon";
import { EditorRow } from "./editor-row";

interface DataLayerProps {
  card: Card;
  library: ContactItem[];
  editing: boolean;
  onAddItem: () => void;
  onUpdateItem: (id: string, data: Partial<ContactItem>) => void;
  onToggleActive: (itemId: string) => void;
}

function PeekRow({ item, isActive }: { item: ContactItem; isActive: boolean }) {
  const displayValue = item.value.replace(/^https?:\/\//, "").replace(/^www\./, "");

  return (
    <div className="flex h-[52px] shrink-0 items-center gap-2.5 border-b border-[#f4f4f2]">
      <ContactIcon
        type={item.type}
        size={15}
        className={`shrink-0 ${isActive ? "text-[#4a4a4a]" : "text-[#c9c9c9]"}`}
      />
      <span className="min-w-0 flex-1">
        <span
          className={`block text-[10px] leading-none ${
            isActive ? "text-[#a3a3a3]" : "text-[#c9c9c9]"
          }`}
        >
          {typeLabel(item.type)}
        </span>
        <span
          className={`mt-1 block truncate text-[14px] leading-snug ${
            isActive ? "font-semibold text-[#1a1a1a]" : "text-[#b4b4b4]"
          }`}
        >
          {displayValue}
        </span>
      </span>
      <span
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[17px] font-light leading-none ${
          isActive ? "bg-[#f4f4f2] text-[#1a1a1a]" : "text-[#c4c4c4]"
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

  const addRow = editing ? (
    <button
      type="button"
      data-no-toggle
      aria-label="Add a new field"
      onClick={(e) => {
        e.stopPropagation();
        onAddItem();
      }}
      className="flex h-[52px] shrink-0 items-center gap-3 border-b border-[#f4f4f2] text-left"
    >
      <span className="min-w-0 flex-1 text-[14px] text-[#c9c9c9]">Add anything</span>
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[19px] font-light leading-none text-[#1a1a1a]">
        +
      </span>
    </button>
  ) : (
    <div className="flex h-[52px] shrink-0 items-center gap-3 border-b border-[#f4f4f2]">
      <span className="min-w-0 flex-1 text-[14px] text-[#c9c9c9]">Add anything</span>
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[19px] font-light leading-none text-[#c4c4c4]">
        +
      </span>
    </div>
  );

  return (
    <div
      data-wheel-scroll={editing ? "" : undefined}
      className={`flex min-h-0 flex-col px-5 ${
        editing ? "flex-1 overflow-y-auto overscroll-contain scrollbar-hide" : "overflow-hidden"
      }`}
    >
      {editing
        ? sorted.map((item) => (
            <EditorRow
              key={item.id}
              item={item}
              isActive={card.contactItemIds.includes(item.id)}
              isEmpty={false}
              onUpdate={(data) => onUpdateItem(item.id, data)}
              onToggleActive={() => onToggleActive(item.id)}
            />
          ))
        : sorted.map((item) => (
            <PeekRow
              key={item.id}
              item={item}
              isActive={card.contactItemIds.includes(item.id)}
            />
          ))}

      {editing && draft && (
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

      {!draft && addRow}
    </div>
  );
}

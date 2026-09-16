"use client";

import { useMemo } from "react";
import type { Card, ContactItem } from "@/shared/types";
import { isContactFilled, sortContactList } from "@/features/portfolio/services/contact-item";
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
    <div className="flex h-12 shrink-0 items-center gap-2.5 border-b border-[#f2f0ec]">
      <ContactIcon
        type={item.type}
        size={14}
        className={`shrink-0 ${isActive ? "text-[#8d867b]" : "text-[#cdc7bd]"}`}
      />
      <span
        className={`min-w-0 flex-1 truncate text-[13.5px] leading-snug ${
          isActive ? "text-[#2b2620]" : "text-[#bdb7ad]"
        }`}
      >
        {displayValue}
      </span>
      <span
        className={`flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full text-[15px] font-light leading-none ring-1 ${
          isActive ? "text-[#8d867b] ring-[#e9e6e0]" : "text-[#c0b9ae] ring-[#f0ede8]"
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

      {!draft && (
        <div className="flex shrink-0 flex-col items-center gap-1.5 pt-4 pb-2">
          {editing ? (
            <button
              type="button"
              data-no-toggle
              onClick={(e) => {
                e.stopPropagation();
                onAddItem();
              }}
              aria-label="Add a new field"
              className="text-[20px] font-light leading-none text-[#3a3530]"
            >
              +
            </button>
          ) : (
            <span className="text-[20px] font-light leading-none text-[#c0b9ae]">+</span>
          )}
          <span className="text-[10.5px] leading-none text-[#bdb7ad]">
            link, email, phone, file…
          </span>
        </div>
      )}
    </div>
  );
}

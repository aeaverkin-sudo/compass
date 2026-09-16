"use client";

import { useMemo } from "react";
import { ChevronUp } from "lucide-react";
import type { Card, ContactItem } from "@/shared/types";
import { isContactFilled, sortContactList } from "@/features/portfolio/services/contact-item";
import { EditorRow } from "./editor-row";

const EDITOR_VH = 42;

interface EditorSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  card: Card;
  library: ContactItem[];
  onAddItem: () => void;
  onUpdateItem: (id: string, data: Partial<ContactItem>) => void;
  onToggleActive: (itemId: string) => void;
  onPurgeEmpty: () => void;
}

export function EditorSheet({
  open,
  onOpenChange,
  card,
  library,
  onAddItem,
  onUpdateItem,
  onToggleActive,
  onPurgeEmpty,
}: EditorSheetProps) {
  const filled = useMemo(() => library.filter(isContactFilled), [library]);
  const draft = useMemo(() => library.find((i) => !isContactFilled(i)), [library]);

  const sorted = useMemo(
    () => sortContactList(filled, card.contactItemIds),
    [filled, card.contactItemIds],
  );

  const handleOpenChange = (next: boolean) => {
    if (!next) onPurgeEmpty();
    onOpenChange(next);
  };

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-lg transition-[height] duration-300 ease-out"
      style={{ height: open ? `${EDITOR_VH}vh` : "auto" }}
    >
      <div
        className="flex h-full flex-col rounded-t-2xl bg-white"
        style={{ boxShadow: "0 -4px 24px rgba(0,0,0,0.1)" }}
      >
        <button
          type="button"
          data-editor-handle
          aria-expanded={open}
          aria-label={open ? "Close editor" : "Open editor"}
          onClick={() => handleOpenChange(!open)}
          className="flex w-full shrink-0 flex-col items-center justify-center px-6 pt-5 pb-4"
          style={{
            minHeight: "calc(88px + env(safe-area-inset-bottom))",
            paddingBottom: "calc(16px + env(safe-area-inset-bottom))",
          }}
        >
          <div className="mb-3 h-1.5 w-12 rounded-full bg-[#ccc]" />
          {!open && (
            <span className="flex items-center gap-1.5 text-[13px] text-[#888]">
              <ChevronUp size={16} strokeWidth={1.5} />
              Tap to edit
            </span>
          )}
        </button>

        {open && (
          <div
            data-wheel-scroll
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-4 scrollbar-hide"
            style={{ paddingBottom: "calc(16px + env(safe-area-inset-bottom))" }}
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
              <div className="flex justify-center py-3">
                <button
                  type="button"
                  onClick={onAddItem}
                  className="text-[22px] font-light leading-none text-[#1a1a1a]"
                  aria-label="Add new item"
                >
                  +
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

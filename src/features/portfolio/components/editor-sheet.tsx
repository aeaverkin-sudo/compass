"use client";

import { useMemo, useRef } from "react";
import { ChevronUp } from "lucide-react";
import type { Card, ContactItem } from "@/shared/types";
import { isContactFilled, sortContactList } from "@/features/portfolio/services/contact-item";
import { EditorRow } from "./editor-row";

const EDITOR_VH = 40;
const HANDLE_VH = 7;

interface EditorSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  card: Card;
  library: ContactItem[];
  onAddItem: () => void;
  onUpdateItem: (id: string, data: Partial<ContactItem>) => void;
  onToggleActive: (itemId: string) => void;
}

export function EditorSheet({
  open,
  onOpenChange,
  card,
  library,
  onAddItem,
  onUpdateItem,
  onToggleActive,
}: EditorSheetProps) {
  const dragStart = useRef(0);
  const dragging = useRef(false);
  const dragDelta = useRef(0);

  const sorted = useMemo(
    () => sortContactList(library, card.contactItemIds),
    [library, card.contactItemIds],
  );

  const heightVh = open ? EDITOR_VH : HANDLE_VH;

  const snap = (dy: number) => {
    if (dy > 36) onOpenChange(true);
    else if (dy < -36) onOpenChange(false);
  };

  const onHandlePointerDown = (e: React.PointerEvent) => {
    dragging.current = true;
    dragStart.current = e.clientY;
    dragDelta.current = 0;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onHandlePointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    dragDelta.current = dragStart.current - e.clientY;
  };

  const onHandlePointerUp = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    dragging.current = false;
    snap(dragDelta.current);
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
  };

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-lg transition-[height] duration-300 ease-out"
      style={{ height: `${heightVh}vh` }}
    >
      <div
        className="flex h-full flex-col rounded-t-2xl bg-white/98 backdrop-blur-sm"
        style={{ boxShadow: "0 -4px 24px rgba(0,0,0,0.08)" }}
      >
        <div
          className="flex shrink-0 cursor-grab flex-col items-center pt-3 pb-2 active:cursor-grabbing"
          onPointerDown={onHandlePointerDown}
          onPointerMove={onHandlePointerMove}
          onPointerUp={onHandlePointerUp}
        >
          <div className="mb-2 h-1 w-10 rounded-full bg-[#ddd]" />
          {!open && (
            <button
              type="button"
              onClick={() => onOpenChange(true)}
              className="flex items-center gap-1 text-[11px] text-[#aaa]"
            >
              <ChevronUp size={14} strokeWidth={1.5} />
              Swipe up to edit
            </button>
          )}
        </div>

        {open && (
          <>
            <div
              data-wheel-scroll
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 scrollbar-hide"
            >
              {sorted.map((item) => (
                <EditorRow
                  key={item.id}
                  item={item}
                  isActive={card.contactItemIds.includes(item.id)}
                  isEmpty={!isContactFilled(item)}
                  onUpdate={(data) => onUpdateItem(item.id, data)}
                  onToggleActive={() => onToggleActive(item.id)}
                />
              ))}
            </div>

            <div className="flex shrink-0 justify-center border-t border-[#f0f0f0] py-3">
              <button
                type="button"
                onClick={onAddItem}
                className="text-[13px] text-[#666]"
              >
                + Add anything
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

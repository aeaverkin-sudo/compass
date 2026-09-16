"use client";

import { useEffect, useMemo, useRef } from "react";
import { ChevronUp } from "lucide-react";
import type { Card, ContactItem } from "@/shared/types";
import { isContactFilled, sortContactList } from "@/features/portfolio/services/contact-item";
import { EditorRow } from "./editor-row";

const EDITOR_VH = 40;

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
  const handleRef = useRef<HTMLDivElement>(null);
  const dragStartY = useRef(0);
  const dragDelta = useRef(0);
  const dragging = useRef(false);
  const didDrag = useRef(false);

  const sorted = useMemo(
    () => sortContactList(library, card.contactItemIds),
    [library, card.contactItemIds],
  );

  useEffect(() => {
    const el = handleRef.current;
    if (!el) return;
    const blockPull = (e: TouchEvent) => {
      if (dragging.current) e.preventDefault();
    };
    el.addEventListener("touchmove", blockPull, { passive: false });
    return () => el.removeEventListener("touchmove", blockPull);
  }, []);

  const snap = (dy: number) => {
    if (dy > 40) onOpenChange(true);
    else if (dy < -40) onOpenChange(false);
  };

  const onDragStart = (clientY: number) => {
    dragging.current = true;
    didDrag.current = false;
    dragStartY.current = clientY;
    dragDelta.current = 0;
  };

  const onDragMove = (clientY: number) => {
    if (!dragging.current) return;
    dragDelta.current = dragStartY.current - clientY;
    if (Math.abs(dragDelta.current) > 10) didDrag.current = true;
  };

  const onDragEnd = () => {
    if (!dragging.current) return;
    dragging.current = false;
    if (didDrag.current) {
      snap(dragDelta.current);
    } else {
      onOpenChange(!open);
    }
    dragDelta.current = 0;
  };

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-lg transition-[height] duration-300 ease-out"
      style={{ height: open ? `${EDITOR_VH}vh` : "auto" }}
    >
      <div
        className="flex h-full flex-col rounded-t-2xl bg-white/98 backdrop-blur-sm pb-[env(safe-area-inset-bottom)]"
        style={{ boxShadow: "0 -4px 24px rgba(0,0,0,0.08)" }}
      >
        <div
          ref={handleRef}
          data-editor-handle
          role="button"
          tabIndex={0}
          aria-expanded={open}
          aria-label={open ? "Close editor" : "Open editor"}
          className="flex min-h-[56px] shrink-0 cursor-pointer flex-col items-center justify-center px-6 pt-3 pb-1"
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onOpenChange(!open);
            }
          }}
          onPointerDown={(e) => {
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            onDragStart(e.clientY);
          }}
          onPointerMove={(e) => onDragMove(e.clientY)}
          onPointerUp={(e) => {
            (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
            onDragEnd();
          }}
          onPointerCancel={onDragEnd}
        >
          <div className="mb-2 h-1 w-10 rounded-full bg-[#ddd]" />
          {!open && (
            <span className="flex items-center gap-1 text-[11px] text-[#aaa]">
              <ChevronUp size={14} strokeWidth={1.5} />
              Tap to edit
            </span>
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
              <button type="button" onClick={onAddItem} className="text-[13px] text-[#666]">
                + Add anything
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

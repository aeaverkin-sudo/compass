"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { Card, ContactItem } from "@/shared/types";
import { isContactFilled, sortContactList } from "@/features/portfolio/services/contact-item";
import { EditorRow } from "./editor-row";

const ROW_H = 44;
const LEVEL1_VH = 33;
const LEVEL2_VH = 72;

interface EditorSheetProps {
  card: Card;
  library: ContactItem[];
  expandedCard: boolean;
  onAddItem: () => void;
  onUpdateItem: (id: string, data: Partial<ContactItem>) => void;
  onToggleActive: (itemId: string) => void;
}

function rowFocusStyle(distPx: number): React.CSSProperties {
  const d = Math.abs(distPx);
  const t = Math.min(d / 120, 1);
  return {
    opacity: 1 - t * 0.55,
    transform: `scale(${1 - t * 0.04})`,
    filter: t > 0.6 ? `blur(${(t - 0.6) * 3}px)` : undefined,
  };
}

export function EditorSheet({
  card,
  library,
  expandedCard,
  onAddItem,
  onUpdateItem,
  onToggleActive,
}: EditorSheetProps) {
  const [level, setLevel] = useState(0);
  const [dragY, setDragY] = useState(0);
  const [rowStyles, setRowStyles] = useState<Record<string, React.CSSProperties>>({});
  const scrollRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragStart = useRef(0);
  const dragging = useRef(false);

  const sorted = useMemo(
    () => sortContactList(library, card.contactItemIds),
    [library, card.contactItemIds],
  );

  const useWheel = sorted.length > 4;
  const wheelItems = useMemo(() => {
    if (!useWheel) return sorted;
    return [...sorted, ...sorted, ...sorted];
  }, [sorted, useWheel]);

  const targetVh = level === 2 ? LEVEL2_VH : level === 1 ? LEVEL1_VH : 8;
  const sheetHeight = `calc(${targetVh}vh + ${dragY}px)`;

  const updateRowFocus = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const center = el.scrollTop + el.clientHeight / 2;
    const styles: Record<string, React.CSSProperties> = {};
    wheelItems.forEach((item, i) => {
      const rowCenter = i * ROW_H + ROW_H / 2;
      styles[`${item.id}-${i}`] = rowFocusStyle(rowCenter - center);
    });
    setRowStyles(styles);
  }, [wheelItems]);

  useEffect(() => {
    if (!useWheel || !scrollRef.current || sorted.length === 0) return;
    scrollRef.current.scrollTop = sorted.length * ROW_H;
    updateRowFocus();
  }, [useWheel, sorted.length, card.id, updateRowFocus]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el || !useWheel || sorted.length === 0) return;
    const n = sorted.length;
    const max = n * ROW_H * 2;
    const min = n * ROW_H * 0.5;
    if (el.scrollTop <= min) el.scrollTop += n * ROW_H;
    else if (el.scrollTop >= max) el.scrollTop -= n * ROW_H;
    updateRowFocus();
  };

  const snapLevel = (delta: number, currentLevel: number) => {
    if (delta > 40) {
      if (currentLevel === 0) return 1;
      if (currentLevel === 1) return 2;
      return 2;
    }
    if (delta < -40) {
      if (currentLevel === 2) return 1;
      if (currentLevel === 1) return 0;
      return 0;
    }
    return currentLevel;
  };

  const onHandlePointerDown = (e: React.PointerEvent) => {
    dragging.current = true;
    dragStart.current = e.clientY;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onHandlePointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    const dy = dragStart.current - e.clientY;
    setDragY(Math.max(-80, Math.min(120, dy)));
  };

  const onHandlePointerUp = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    dragging.current = false;
    const dy = dragStart.current - e.clientY;
    setLevel((l) => snapLevel(dy, l));
    setDragY(0);
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  };

  const navLinks = [
    { href: "/portfolio", label: "Card" },
    { href: "/people", label: "Connections" },
    { href: "/analytics", label: "Stats" },
    { href: "/settings", label: "Settings" },
  ];

  return (
    <div
      ref={sheetRef}
      className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-lg transition-[height] duration-300 ease-out"
      style={{
        height: sheetHeight,
        maxHeight: expandedCard ? "22vh" : undefined,
      }}
    >
      <div
        className="flex h-full flex-col rounded-t-2xl bg-white/95 backdrop-blur-md"
        style={{ boxShadow: "0 -4px 24px rgba(0,0,0,0.08)" }}
      >
        <div
          className="flex shrink-0 cursor-grab flex-col items-center py-3 active:cursor-grabbing"
          onPointerDown={onHandlePointerDown}
          onPointerMove={onHandlePointerMove}
          onPointerUp={onHandlePointerUp}
        >
          <div className="h-1 w-10 rounded-full bg-[#ddd]" />
        </div>

        {level >= 1 && (
          <>
            <div className="relative mx-4 mb-1 shrink-0">
              <div className="pointer-events-none absolute inset-x-0 top-1/2 h-11 -translate-y-1/2 rounded-lg bg-[#1a1a1a]/[0.03]" />
              <div
                ref={useWheel ? scrollRef : undefined}
                onScroll={useWheel ? handleScroll : undefined}
                data-wheel-scroll
                className={
                  useWheel
                    ? "max-h-[180px] overflow-y-auto overscroll-none scrollbar-hide"
                    : "flex flex-col"
                }
                style={useWheel ? { touchAction: "pan-y" } : undefined}
              >
                {wheelItems.map((item, i) => (
                  <EditorRow
                    key={`${item.id}-${i}`}
                    item={item}
                    isActive={card.contactItemIds.includes(item.id)}
                    isEmpty={!isContactFilled(item)}
                    style={rowStyles[`${item.id}-${i}`]}
                    onUpdate={(data) => onUpdateItem(item.id, data)}
                    onToggleActive={() => onToggleActive(item.id)}
                  />
                ))}
              </div>
            </div>

            <div className="flex shrink-0 justify-center py-2">
              <button
                type="button"
                onClick={onAddItem}
                className="text-[24px] font-light leading-none text-[#1a1a1a]"
              >
                +
              </button>
            </div>
          </>
        )}

        {level >= 2 && (
          <nav className="flex-1 border-t border-[#1a1a1a]/8 px-6 py-4">
            <ul className="space-y-1">
              {navLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="block rounded-lg px-3 py-3 text-[15px] text-[#1a1a1a] hover:bg-[#f5f5f5]"
                    onClick={() => setLevel(0)}
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </div>
    </div>
  );
}

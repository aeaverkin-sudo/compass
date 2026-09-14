"use client";

import { useEffect, useMemo, useRef } from "react";
import type { ContentSlot, Portfolio } from "@/shared/types";
import { emptyFieldPlaceholder, sortLibrarySlots } from "@/features/portfolio/services/portfolio-factory";
import { isSlotFilled } from "@/features/portfolio/services/content-detector";
import { ContentFieldRow } from "./content-field-row";

const ROW_H = 44;

interface ContentWheelProps {
  portfolio: Portfolio;
  library: ContentSlot[];
  onAddSlot: () => void;
  onUpdateSlot: (slotId: string, data: Partial<ContentSlot>) => void;
  onDeleteSlot: (slotId: string) => void;
  onToggleActive: (slotId: string) => void;
}

export function ContentWheel({
  portfolio,
  library,
  onAddSlot,
  onUpdateSlot,
  onDeleteSlot,
  onToggleActive,
}: ContentWheelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const sorted = useMemo(
    () => sortLibrarySlots(library, portfolio.activeSlotIds),
    [library, portfolio.activeSlotIds],
  );

  const emptyCount = sorted.filter((s) => !isSlotFilled(s)).length;
  const firstEmptyId = sorted.find((s) => !isSlotFilled(s))?.id;
  const useWheel = sorted.length > 5;

  const wheelItems = useMemo(() => {
    if (!useWheel) return sorted;
    return [...sorted, ...sorted, ...sorted];
  }, [sorted, useWheel]);

  useEffect(() => {
    if (!useWheel || !scrollRef.current || sorted.length === 0) return;
    scrollRef.current.scrollTop = sorted.length * ROW_H;
  }, [useWheel, sorted.length, portfolio.id]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el || !useWheel || sorted.length === 0) return;
    const n = sorted.length;
    const max = n * ROW_H * 2;
    const min = n * ROW_H * 0.5;
    if (el.scrollTop <= min) el.scrollTop += n * ROW_H;
    else if (el.scrollTop >= max) el.scrollTop -= n * ROW_H;
  };

  const getPlaceholder = (slot: ContentSlot) => {
    if (isSlotFilled(slot)) return "";
    if (slot.id === firstEmptyId) return emptyFieldPlaceholder(true, emptyCount);
    return "";
  };

  const renderRow = (slot: ContentSlot, key: string) => (
    <ContentFieldRow
      key={key}
      slot={slot}
      isActive={portfolio.activeSlotIds.includes(slot.id)}
      isEmpty={!isSlotFilled(slot)}
      placeholder={getPlaceholder(slot)}
      onUpdate={(data) => onUpdateSlot(slot.id, data)}
      onDelete={() => onDeleteSlot(slot.id)}
      onToggleActive={() => onToggleActive(slot.id)}
    />
  );

  if (sorted.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <button
          type="button"
          onClick={onAddSlot}
          className="text-[22px] font-light leading-none text-[#1a1a1a]"
          style={{ textShadow: "0 1px 2px rgba(0,0,0,0.06)" }}
        >
          +
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col items-center justify-center overflow-hidden px-6">
      <div
        ref={useWheel ? scrollRef : undefined}
        onScroll={useWheel ? handleScroll : undefined}
        data-wheel-scroll
        className={
          useWheel
            ? "max-h-[220px] w-full max-w-md overflow-y-auto overscroll-none scrollbar-hide"
            : "flex w-full max-w-md flex-col items-center"
        }
        style={useWheel ? { touchAction: "pan-y" } : undefined}
      >
        {wheelItems.map((slot, i) => renderRow(slot, `${slot.id}-${i}`))}
      </div>

      <button
        type="button"
        onClick={onAddSlot}
        className="mt-1 shrink-0 py-2 text-[22px] font-light leading-none text-[#1a1a1a]"
        style={{ textShadow: "0 1px 2px rgba(0,0,0.06)" }}
      >
        +
      </button>
    </div>
  );
}

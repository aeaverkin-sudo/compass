"use client";

import { useMemo, useState } from "react";
import type { ContentSlot, Portfolio } from "@/shared/types";
import { sortLibrarySlots } from "@/features/portfolio/services/portfolio-factory";
import { isSlotFilled } from "@/features/portfolio/services/content-detector";
import { ContentFieldRow } from "./content-field-row";
import { FieldEditPanel } from "./field-edit-panel";

interface ContentWheelProps {
  portfolio: Portfolio;
  library: ContentSlot[];
  onAddSlot: () => void;
  onUpdateSlot: (slotId: string, data: Partial<ContentSlot>) => void;
  onDeleteSlot: (slotId: string) => void;
  onToggleActive: (slotId: string) => void;
  slotLimitReached: boolean;
}

export function ContentWheel({
  portfolio,
  library,
  onAddSlot,
  onUpdateSlot,
  onDeleteSlot,
  onToggleActive,
  slotLimitReached,
}: ContentWheelProps) {
  const [editingSlotId, setEditingSlotId] = useState<string | null>(null);

  const sorted = useMemo(
    () => sortLibrarySlots(library, portfolio.activeSlotIds),
    [library, portfolio.activeSlotIds],
  );

  const editingSlot = editingSlotId ? library.find((s) => s.id === editingSlotId) : null;
  const manyItems = sorted.length > 4;

  return (
    <div className="flex h-full items-center justify-center overflow-hidden px-6 py-4">
      <div
        className={`flex w-full max-w-md flex-col items-center ${
          manyItems ? "max-h-full overflow-y-auto overscroll-contain scrollbar-hide" : "justify-center"
        }`}
        style={
          manyItems
            ? {
                maskImage: "linear-gradient(to bottom, transparent, black 6%, black 94%, transparent)",
                WebkitMaskImage: "linear-gradient(to bottom, transparent, black 6%, black 94%, transparent)",
                touchAction: "pan-y",
              }
            : undefined
        }
      >
        {sorted.map((slot) => {
          const isActive = portfolio.activeSlotIds.includes(slot.id);
          const isEmpty = !isSlotFilled(slot);
          return (
            <ContentFieldRow
              key={slot.id}
              slot={slot}
              isActive={isActive}
              isEmpty={isEmpty}
              onToggleActive={() => onToggleActive(slot.id)}
              onEdit={() => setEditingSlotId(slot.id)}
              onDelete={() => onDeleteSlot(slot.id)}
              onFill={() => setEditingSlotId(slot.id)}
            />
          );
        })}

        <button
          type="button"
          onClick={() => {
            if (!slotLimitReached) onAddSlot();
          }}
          className="mt-1 shrink-0 touch-none py-2 text-[22px] font-light leading-none text-[#1a1a1a]"
          style={{ textShadow: "0 1px 2px rgba(0,0,0,0.06)" }}
          aria-label="Add new field"
        >
          +
        </button>
      </div>

      {editingSlot && (
        <FieldEditPanel
          slot={editingSlot}
          onSave={(data) => onUpdateSlot(editingSlot.id, data)}
          onClose={() => setEditingSlotId(null)}
        />
      )}
    </div>
  );
}

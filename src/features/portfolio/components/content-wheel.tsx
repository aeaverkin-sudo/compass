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

  return (
    <div className="flex flex-1 flex-col items-center overflow-hidden px-6 pt-4 pb-8">
      <div
        className="flex max-h-[280px] w-full max-w-md flex-col items-center overflow-y-auto scrollbar-hide"
        style={{
          maskImage: "linear-gradient(to bottom, transparent, black 8%, black 92%, transparent)",
          WebkitMaskImage: "linear-gradient(to bottom, transparent, black 8%, black 92%, transparent)",
        }}
      >
        <div className="flex w-full flex-col items-center py-4">
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
        </div>
      </div>

      <button
        type="button"
        onClick={() => {
          if (!slotLimitReached) onAddSlot();
        }}
        className="mt-auto text-[22px] font-light leading-none text-[#1a1a1a]"
        style={{ textShadow: "0 1px 2px rgba(0,0,0,0.06)" }}
        aria-label="Add new field"
      >
        +
      </button>

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

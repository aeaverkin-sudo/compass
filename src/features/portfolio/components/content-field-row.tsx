"use client";

import { useState } from "react";
import type { ContentSlot } from "@/shared/types";
import { isSlotFilled } from "@/features/portfolio/services/content-detector";

interface ContentFieldRowProps {
  slot: ContentSlot;
  isActive: boolean;
  isEmpty: boolean;
  onToggleActive: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onFill: () => void;
}

export function ContentFieldRow({
  slot,
  isActive,
  isEmpty,
  onToggleActive,
  onEdit,
  onDelete,
  onFill,
}: ContentFieldRowProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const filled = isSlotFilled(slot);

  const label = isEmpty ? "Add file, link or social profile" : slot.label;

  const handleRowTap = () => {
    if (isEmpty) {
      onFill();
      return;
    }
    setMenuOpen((v) => !v);
  };

  return (
    <div className="relative flex w-full max-w-md items-center justify-between gap-4 py-2.5">
      <button
        type="button"
        className={`min-w-0 flex-1 text-left text-[14px] ${
          isActive && filled ? "font-semibold text-[#1a1a1a]" : "font-normal text-[#888]"
        } ${isEmpty ? "text-[#aaa]" : ""}`}
        onClick={handleRowTap}
      >
        {label}
        {filled && slot.type === "link" && (
          <span className="mt-0.5 block truncate text-[11px] font-normal text-[#bbb]">
            {slot.value.replace(/^https?:\/\//, "")}
          </span>
        )}
      </button>

      {filled && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleActive();
          }}
          className="shrink-0 px-2 text-[18px] font-light leading-none text-[#1a1a1a]"
          aria-label={isActive ? "Remove from card" : "Add to card"}
        >
          {isActive ? "−" : "+"}
        </button>
      )}

      {menuOpen && filled && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40"
            onClick={() => setMenuOpen(false)}
          />
          <div
            className="absolute left-1/2 top-full z-50 mt-1 -translate-x-1/2 border border-[#1a1a1a]/10 bg-[#faf9f7] py-1"
            style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}
          >
            <button
              type="button"
              className="block w-full px-8 py-2 text-left text-[13px] hover:bg-[#f0efed]"
              onClick={() => {
                setMenuOpen(false);
                onEdit();
              }}
            >
              Edit
            </button>
            <button
              type="button"
              className="block w-full px-8 py-2 text-left text-[13px] text-[#888] hover:bg-[#f0efed]"
              onClick={() => {
                setMenuOpen(false);
                onDelete();
              }}
            >
              Delete
            </button>
          </div>
        </>
      )}
    </div>
  );
}

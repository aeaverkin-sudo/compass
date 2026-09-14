"use client";

import { useRef, useState } from "react";
import type { ContentSlot } from "@/shared/types";
import {
  deriveLabel,
  detectContentType,
  isSlotFilled,
  slotDisplayLabel,
} from "@/features/portfolio/services/content-detector";
import { fileToDataUrl } from "@/shared/lib/utils";

interface ContentFieldRowProps {
  slot: ContentSlot;
  isActive: boolean;
  isEmpty: boolean;
  placeholder: string;
  onUpdate: (data: Partial<ContentSlot>) => void;
  onDelete: () => void;
  onToggleActive: () => void;
}

export function ContentFieldRow({
  slot,
  isActive,
  isEmpty,
  placeholder,
  onUpdate,
  onDelete,
  onToggleActive,
}: ContentFieldRowProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const longPressRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const filled = isSlotFilled(slot);

  const applyValue = (raw: string, mimeType?: string) => {
    const value = raw.trim();
    if (!value) return;
    const type = detectContentType(value, mimeType);
    onUpdate({
      value,
      type,
      label: deriveLabel(value, type, slot.label),
    });
    setEditing(false);
    setMenuOpen(false);
  };

  const handleLiveChange = (text: string) => {
    if (!text.trim()) return;
    const type = detectContentType(text);
    onUpdate({
      value: text,
      type,
      label: deriveLabel(text, type, slot.label),
    });
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    applyValue(await fileToDataUrl(file), file.type);
    e.target.value = "";
  };

  const handleRowTap = () => {
    if (filled) {
      setMenuOpen((v) => !v);
    } else {
      setEditing(true);
    }
  };

  const startLongPress = () => {
    longPressRef.current = setTimeout(() => {
      if (filled) setMenuOpen(true);
      else fileRef.current?.click();
    }, 450);
  };

  const endLongPress = () => {
    if (longPressRef.current) clearTimeout(longPressRef.current);
  };

  const editValue = filled && slot.value.startsWith("data:") ? slot.label : slot.value;

  return (
    <div className="relative flex h-11 w-full max-w-md shrink-0 items-center justify-between gap-4">
      <input ref={fileRef} type="file" accept="*/*" className="hidden" onChange={handleFile} />

      {editing ? (
        <input
          autoFocus
          type="text"
          defaultValue={filled ? editValue : ""}
          placeholder={placeholder || " "}
          className="min-w-0 flex-1 border-b border-[#1a1a1a] bg-transparent py-1 text-[14px] text-[#1a1a1a] outline-none"
          onChange={(e) => handleLiveChange(e.target.value)}
          onPaste={(e) => {
            const text = e.clipboardData.getData("text");
            if (text) applyValue(text);
          }}
          onBlur={() => setEditing(false)}
        />
      ) : (
        <button
          type="button"
          className={`min-w-0 flex-1 truncate text-left text-[14px] ${
            isActive && filled ? "font-semibold text-[#1a1a1a]" : "font-normal text-[#888]"
          } ${isEmpty ? "text-[#aaa]" : ""}`}
          onClick={handleRowTap}
          onPointerDown={startLongPress}
          onPointerUp={endLongPress}
          onPointerLeave={endLongPress}
        >
          {slotDisplayLabel(slot, placeholder) || "\u00a0"}
        </button>
      )}

      {filled && !editing && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleActive();
          }}
          className="shrink-0 px-2 text-[18px] font-light leading-none text-[#1a1a1a]"
        >
          {isActive ? "−" : "+"}
        </button>
      )}

      {menuOpen && filled && !editing && (
        <>
          <button type="button" className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
          <div
            className="absolute left-1/2 top-full z-50 -translate-x-1/2 border border-[#1a1a1a]/10 bg-[#faf9f7] py-0.5"
            style={{ boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}
          >
            <button
              type="button"
              className="block w-full px-10 py-2 text-[13px] text-[#1a1a1a]"
              onClick={() => {
                setMenuOpen(false);
                setEditing(true);
              }}
            >
              Edit
            </button>
            <button
              type="button"
              className="block w-full px-10 py-2 text-[13px] text-[#888]"
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

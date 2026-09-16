"use client";

import { useState } from "react";
import type { ContactItem } from "@/shared/types";
import { buildContactItem, typeLabel } from "@/features/portfolio/services/contact-item";
import { ContactIcon } from "./contact-icon";

interface EditorRowProps {
  item: ContactItem;
  isActive: boolean;
  isEmpty: boolean;
  autoEdit?: boolean;
  onUpdate: (data: Partial<ContactItem>) => void;
  onToggleActive: () => void;
}

export function EditorRow({
  item,
  isActive,
  isEmpty,
  autoEdit,
  onUpdate,
  onToggleActive,
}: EditorRowProps) {
  const [editing, setEditing] = useState(Boolean(autoEdit && isEmpty));

  const pushValue = (raw: string) => {
    const built = buildContactItem(raw);
    onUpdate({
      value: raw,
      type: built.type,
      url: built.url,
      label: item.label || built.label,
    });
  };

  const displayValue = (item.value || item.label)
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "");

  if (editing) {
    return (
      <div
        className="flex h-[52px] shrink-0 items-center border-b border-[#f4f4f2]"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          autoFocus
          type="text"
          defaultValue={isEmpty ? "" : displayValue}
          placeholder="Paste link, email or phone"
          className="min-w-0 flex-1 bg-transparent text-[14px] text-[#1a1a1a] outline-none placeholder:text-[#c4c4c4]"
          onChange={(e) => {
            if (e.target.value.trim()) pushValue(e.target.value);
          }}
          onPaste={(e) => {
            const text = e.clipboardData.getData("text");
            if (text.trim()) pushValue(text.trim());
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") setEditing(false);
          }}
          onBlur={() => {
            if (!isEmpty || item.value.trim()) setEditing(false);
          }}
        />
      </div>
    );
  }

  return (
    <div
      className="flex h-[52px] shrink-0 items-center gap-3 border-b border-[#f4f4f2]"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
      >
        <ContactIcon
          type={item.type}
          size={15}
          className={`shrink-0 ${isActive ? "text-[#4a4a4a]" : "text-[#c9c9c9]"}`}
        />
        <span className="min-w-0 flex-1">
          <span
            className={`block text-[10px] leading-none ${
              isActive ? "text-[#a3a3a3]" : "text-[#c9c9c9]"
            }`}
          >
            {typeLabel(item.type)}
          </span>
          <span
            className={`mt-1 block truncate text-[14px] leading-snug ${
              isActive ? "font-semibold text-[#1a1a1a]" : "text-[#b4b4b4]"
            }`}
          >
            {displayValue}
          </span>
        </span>
      </button>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggleActive();
        }}
        aria-label={isActive ? "Remove from card" : "Add to card"}
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[17px] font-light leading-none transition-colors ${
          isActive ? "bg-[#f4f4f2] text-[#1a1a1a]" : "text-[#c4c4c4]"
        }`}
      >
        {isActive ? "−" : "+"}
      </button>
    </div>
  );
}

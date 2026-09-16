"use client";

import { useState } from "react";
import type { ContactItem } from "@/shared/types";
import { buildContactItem } from "@/features/portfolio/services/contact-item";
import { useLongPress } from "@/shared/hooks/use-long-press";
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
  const press = useLongPress(() => setEditing(true));

  const pushValue = (raw: string) => {
    const built = buildContactItem(raw);
    onUpdate({ value: raw, type: built.type, url: built.url, label: built.label });
  };

  const displayValue = (item.value.trim() || item.label)
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "");

  if (editing) {
    return (
      <div
        className="flex h-12 shrink-0 items-center border-b border-[#f2f0ec]"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          autoFocus
          type="text"
          defaultValue={isEmpty ? "" : item.value}
          placeholder="link, email, phone, file…"
          className="min-w-0 flex-1 bg-transparent text-[13.5px] text-[#2b2620] outline-none placeholder:text-[#c0b9ae]"
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
    <div className="flex h-12 shrink-0 items-center gap-3 border-b border-[#f2f0ec]">
      <span {...press} className="compass-press flex min-w-0 flex-1 items-center gap-2.5">
        <ContactIcon
          type={item.type}
          size={14}
          className={`shrink-0 ${isActive ? "text-[#8d867b]" : "text-[#cdc7bd]"}`}
        />
        <span
          className={`min-w-0 flex-1 truncate text-[13.5px] leading-snug ${
            isActive ? "text-[#2b2620]" : "text-[#bdb7ad]"
          }`}
        >
          {displayValue}
        </span>
      </span>

      <button
        type="button"
        data-no-toggle
        onClick={(e) => {
          e.stopPropagation();
          onToggleActive();
        }}
        aria-label={isActive ? "Remove from card" : "Add to card"}
        className={`flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full text-[15px] font-light leading-none ring-1 ${
          isActive
            ? "text-[#8d867b] ring-[#e9e6e0]"
            : "text-[#c0b9ae] ring-[#f0ede8]"
        }`}
      >
        {isActive ? "−" : "+"}
      </button>
    </div>
  );
}
